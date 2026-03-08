'use client';

import { useCallback, useRef, useState } from 'react';
import { useAgentStream } from './useAgentStream';
import type { ChatSessionState } from './useSessionManager';
import type { AgentSSEEvent, DrawBatch, SemanticBatch, WhiteboardLayoutDiagnostics } from '@/types/agent';
import type { NotificationItem } from '@/components/app/WarningOverlay';
import type { DrawingEngine } from './useDrawingEngine';
import {
  createMessage,
  looksDefaultTitle,
  buildChatTitleFromMessage,
  withoutStreamOverlay,
} from './useChatSessions';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '@/lib/whiteboard/context';
import { fromLegacyDrawBatchToSemanticStub } from '@/lib/whiteboard/planner';
import { friendlyEventErrorMessage } from '@/lib/client/error-messages';

export interface UseStreamOrchestratorParams {
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSessionState[]>>;
  activeChat: ChatSessionState | undefined;
  activeChatIdRef: React.RefObject<string>;
  sessionId: string;
  drawing: DrawingEngine;
  pushWarning: (warning: string, targetChatId: string, severity?: NotificationItem['severity']) => void;
}

export function useStreamOrchestrator({
  setChatSessions,
  activeChat,
  activeChatIdRef,
  sessionId,
  drawing,
  pushWarning,
}: UseStreamOrchestratorParams) {
  const [status, setStatus] = useState<'idle' | 'thinking' | 'streaming' | 'drawing'>('idle');
  const { run, cancel } = useAgentStream();

  // ─── Stream-lifecycle refs ─────────────────────────────────────
  const streamChatIdRef = useRef<string | null>(null);
  const currentAssistantMessageId = useRef<string | null>(null);
  const turnHadRenderableOutputRef = useRef(false);
  const turnSawToolBatchRef = useRef(false);
  const lastTurnEventsRef = useRef<string[]>([]);
  const partialCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // STATE-001: deterministic cross-channel batch ordering
  const nextExpectedSeqRef = useRef(1);
  const pendingBatchEventsRef = useRef<Map<number, AgentSSEEvent & { type: 'whiteboard.batch' }>>(new Map());
  const pendingDiagnosticsRef = useRef<
    Map<
      string,
      {
        batchId: string;
        templateUsed: WhiteboardLayoutDiagnostics['templateUsed'];
        fallbackUsed: boolean;
        violationsFixed: string[];
        semanticBatch?: SemanticBatch;
      }
    >
  >(new Map());

  // Destructure stable drawing callbacks used in handleEvent/resetStreamState
  const {
    resetDrawingProgress,
    trackBatchElements,
    flashBatchCompletion,
    finishDrawingTurn,
    pushHistoryRef,
    activeBatchesRef,
  } = drawing;

  const resetStreamState = useCallback(() => {
    if (partialCompletionTimerRef.current) {
      clearTimeout(partialCompletionTimerRef.current);
      partialCompletionTimerRef.current = null;
    }
    streamChatIdRef.current = null;
    currentAssistantMessageId.current = null;
    turnHadRenderableOutputRef.current = false;
    turnSawToolBatchRef.current = false;
    pendingDiagnosticsRef.current.clear();
    resetDrawingProgress();
  }, [resetDrawingProgress]);

  const pushTurnEvent = useCallback((event: unknown) => {
    lastTurnEventsRef.current.push(JSON.stringify(event));
    if (lastTurnEventsRef.current.length > 80) {
      lastTurnEventsRef.current = lastTurnEventsRef.current.slice(-80);
    }
  }, []);

  // ─── SSE event dispatcher ──────────────────────────────────────

  const handleEvent = useCallback(
    (event: AgentSSEEvent) => {
      pushTurnEvent(event);
      const targetChatId = streamChatIdRef.current ?? activeChatIdRef.current;
      if (!targetChatId) return;

      if (event.type === 'assistant.text.delta') {
        turnHadRenderableOutputRef.current = true;
        setStatus('streaming');
        setChatSessions((prev) =>
          prev.map((chat) => {
            if (chat.id !== targetChatId) return chat;

            const currentId = currentAssistantMessageId.current;
            if (!currentId) {
              const nextMsg = createMessage('assistant', event.delta);
              currentAssistantMessageId.current = nextMsg.id;
              return {
                ...chat,
                updatedAt: Date.now(),
                messages: [...chat.messages, nextMsg],
              };
            }

            const hasTarget = chat.messages.some((msg) => msg.id === currentId);
            if (!hasTarget) {
              const nextMsg = createMessage('assistant', event.delta);
              currentAssistantMessageId.current = nextMsg.id;
              return {
                ...chat,
                updatedAt: Date.now(),
                messages: [...chat.messages, nextMsg],
              };
            }

            return {
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map((msg) =>
                msg.id === currentId ? { ...msg, content: `${msg.content}${event.delta}` } : msg,
              ),
            };
          }),
        );
        return;
      }

      if (event.type === 'assistant.text.done') {
        currentAssistantMessageId.current = null;
        return;
      }

      if (event.type === 'whiteboard.batch') {
        const seq = event.batch.sequenceNumber;
        if (seq != null && seq > nextExpectedSeqRef.current) {
          pendingBatchEventsRef.current.set(seq, event);
          return;
        }

        const applyBatch = (batchEvent: AgentSSEEvent & { type: 'whiteboard.batch' }) => {
          turnHadRenderableOutputRef.current = true;
          const isProvisionalStreamBatch = batchEvent.batch.batch_id.startsWith('stream-provisional-');
          const firstToolBatch = !isProvisionalStreamBatch && !turnSawToolBatchRef.current;

          if (firstToolBatch) {
            pushHistoryRef.current(activeBatchesRef.current);
          }

          if (!isProvisionalStreamBatch) {
            turnSawToolBatchRef.current = true;
          }
          const diagnostics = pendingDiagnosticsRef.current.get(batchEvent.batch.batch_id);
          if (diagnostics) pendingDiagnosticsRef.current.delete(batchEvent.batch.batch_id);
          setStatus('drawing');

          trackBatchElements(batchEvent.batch.elements);
          flashBatchCompletion();

          setChatSessions((prev) =>
            prev.map((chat) => {
              if (chat.id !== targetChatId) return chat;
              const baseChat = firstToolBatch ? withoutStreamOverlay(chat) : chat;
              const hasClear = batchEvent.batch.elements.some((el) => el.type === 'clear');
              const baseScene = hasClear ? [] : [...baseChat.scene];
              batchEvent.batch.elements.forEach((element) => {
                if (element.type !== 'clear') baseScene.push(element);
              });

              const nextPlannerMeta =
                diagnostics != null
                  ? [
                      ...baseChat.plannerMeta,
                      {
                        batchId: diagnostics.batchId,
                        templateUsed: diagnostics.templateUsed,
                        fallbackUsed: diagnostics.fallbackUsed,
                        violationsFixed: diagnostics.violationsFixed,
                      },
                    ].slice(-40)
                  : baseChat.plannerMeta;

              const semanticBatch =
                diagnostics?.semanticBatch ??
                fromLegacyDrawBatchToSemanticStub(batchEvent.batch.batch_id, batchEvent.batch.elements);
              const nextSemanticScene = [...baseChat.semanticScene, semanticBatch].slice(-80);
              return {
                ...baseChat,
                updatedAt: Date.now(),
                scene: baseScene,
                semanticScene: nextSemanticScene,
                plannerMeta: nextPlannerMeta,
                batches: [...baseChat.batches, batchEvent.batch],
              };
            }),
          );
        };

        applyBatch(event);
        if (seq != null) {
          nextExpectedSeqRef.current = seq + 1;
          while (pendingBatchEventsRef.current.has(nextExpectedSeqRef.current)) {
            const buffered = pendingBatchEventsRef.current.get(nextExpectedSeqRef.current)!;
            pendingBatchEventsRef.current.delete(nextExpectedSeqRef.current);
            applyBatch(buffered);
            nextExpectedSeqRef.current++;
          }
        }
        return;
      }

      if (event.type === 'whiteboard.layout.diagnostics') {
        pendingDiagnosticsRef.current.set(event.batchId, {
          batchId: event.batchId,
          templateUsed: event.templateUsed,
          fallbackUsed: event.fallbackUsed,
          violationsFixed: event.violationsFixed,
          semanticBatch: event.semanticBatch,
        });
        return;
      }

      if (event.type === 'warning') {
        pushWarning(event.message + (event.context ? ` (${event.context})` : ''), targetChatId);
        return;
      }

      if (event.type === 'error') {
        currentAssistantMessageId.current = null;
        resetStreamState();
        setStatus('idle');
        const friendly = friendlyEventErrorMessage(
          event.code,
          event.message,
          event.retryAfterMs,
        );
        setChatSessions((prev) =>
          prev.map((chat) =>
            chat.id === targetChatId
              ? {
                  ...chat,
                  updatedAt: Date.now(),
                  messages: [
                    ...chat.messages,
                    createMessage('assistant', friendly.message, {
                      code: event.code,
                      retryable: friendly.retryable,
                    }),
                  ],
                }
              : chat,
          ),
        );
        return;
      }

      if (event.type === 'turn.done') {
        const hadRenderableOutput = turnHadRenderableOutputRef.current;
        setChatSessions((prev) =>
          prev.map((chat) => {
            if (chat.id !== targetChatId) return chat;
            if (hadRenderableOutput) return chat;
            return {
              ...chat,
              updatedAt: Date.now(),
              messages: [
                ...chat.messages,
                createMessage('assistant', 'I could not produce output for that turn. Please try again.'),
              ],
            };
          }),
        );
        turnHadRenderableOutputRef.current = false;
        finishDrawingTurn(turnSawToolBatchRef.current);
        resetStreamState();
        setStatus('idle');
      }
    },
    [activeChatIdRef, flashBatchCompletion, finishDrawingTurn, pushHistoryRef, activeBatchesRef, pushTurnEvent, pushWarning, resetStreamState, setChatSessions, trackBatchElements],
  );

  // ─── Send message ──────────────────────────────────────────────

  const sendMessage = useCallback(
    (rawInput: string): boolean => {
      if (!activeChat) return false;
      const message = rawInput.trim();
      if (!message || status !== 'idle') return false;

      const chatId = activeChat.id;
      const userMessage = createMessage('user', message);
      const history = [...activeChat.messages];
      const whiteboardContext = buildWhiteboardContext(activeChat.scene);
      const whiteboardContextV2 = buildWhiteboardContextV2(activeChat.scene, activeChat.semanticScene);

      setChatSessions((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat;
          const nextTitle =
            chat.messages.length === 0 || looksDefaultTitle(chat.title)
              ? buildChatTitleFromMessage(message)
              : chat.title;
          return {
            ...chat,
            updatedAt: Date.now(),
            title: nextTitle,
            messages: [...chat.messages, userMessage],
          };
        }),
      );
      setStatus('thinking');
      resetStreamState();
      turnHadRenderableOutputRef.current = false;
      streamChatIdRef.current = chatId;
      lastTurnEventsRef.current = [JSON.stringify({ type: 'turn.started' })];

      void run({
        sessionId,
        userMessage: message,
        history,
        plannerMode: 'semantic_preferred',
        whiteboardContext,
        whiteboardContextV2,
        maxRetries: 0,
        handlers: {
          onEvent: handleEvent,
          onError: (msg, meta) => {
            const errorTargetChatId = streamChatIdRef.current ?? activeChatIdRef.current;
            const hadRenderableOutput = turnHadRenderableOutputRef.current;
            resetStreamState();
            setStatus('idle');
            pushTurnEvent({ type: 'client.error', message: msg });
            if (!errorTargetChatId) return;
            if (hadRenderableOutput) return;

            setChatSessions((prev) =>
              prev.map((chat) =>
                chat.id === errorTargetChatId
                  ? {
                      ...chat,
                      updatedAt: Date.now(),
                      messages: [
                        ...chat.messages,
                        createMessage('assistant', msg, meta ? { code: meta.code, retryable: meta.retryable } : undefined),
                      ],
                    }
                  : chat,
              ),
            );
          },
          onComplete: ({ lastEvent }) => {
            if (!lastEvent) return;
            if (lastEvent.type === 'turn.done' || lastEvent.type === 'error') return;
            pushTurnEvent({ type: 'client.complete', partial: true, source: lastEvent.type });
            if (partialCompletionTimerRef.current) {
              clearTimeout(partialCompletionTimerRef.current);
            }
            partialCompletionTimerRef.current = setTimeout(() => {
              partialCompletionTimerRef.current = null;
              resetStreamState();
              setStatus('idle');
            }, 8_000);
          },
        },
      });
      return true;
    },
    [activeChat, activeChatIdRef, handleEvent, pushTurnEvent, resetStreamState, run, sessionId, setChatSessions, status],
  );

  return {
    status,
    setStatus,
    cancel,
    resetStreamState,
    sendMessage,
    pushTurnEvent,
    lastTurnEventsRef,
    streamChatIdRef,
    currentAssistantMessageId,
  };
}
