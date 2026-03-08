'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatPanel, type ChatThreadMeta } from '@/components/chat/ChatPanel';
import { WhiteboardCanvas } from '@/components/whiteboard/WhiteboardCanvas';
import { useAgentStream } from '@/hooks/useAgentStream';
import { useDrawHistory } from '@/hooks/useDrawHistory';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useSessionManager, type ChatSessionState } from '@/hooks/useSessionManager';
import { AGENT_DOMAINS, QueryEngine } from '@/lib/agent/queryEngine';
import { type AppMode, getClientAppMode, getInitialAppMode } from '@/lib/mode';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '@/lib/whiteboard/context';
import {
  removeStreamOverlayFromBatches,
  removeStreamOverlayFromScene,
} from '@/lib/whiteboard/stream-overlay';
import type {
  AgentSSEEvent,
  ChatMessage,
  DrawBatch,
  DrawElement,
  SemanticBatch,
  WhiteboardLayoutDiagnostics,
} from '@/types/agent';
import { fromLegacyDrawBatchToSemanticStub } from '@/lib/whiteboard/planner';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { AppHeader } from '@/components/app/AppHeader';
import { AgentSidebar } from '@/components/app/AgentSidebar';
import { WarningOverlay, type NotificationItem } from '@/components/app/WarningOverlay';
import { MobilePanelSwitcher } from '@/components/app/MobilePanelSwitcher';
import { DrawPayloadInjector } from '@/components/whiteboard/DrawPayloadInjector';
import { DrawingStatusPill, type DrawingPillState } from '@/components/whiteboard/DrawingStatusPill';
import { DrawingStatistics, type DrawSource } from '@/components/whiteboard/DrawingStatistics';
import type { StreamPhase, DrawingProgressInfo } from '@/components/chat/StreamProgress';
import { friendlyEventErrorMessage } from '@/lib/client/error-messages';

interface AgentAPI {
  submitQuery: (text: string) => Promise<void>;
  getStatus: () => 'idle' | 'thinking' | 'streaming' | 'drawing';
  getMessages: () => { role: string; content: string }[];
  getElementCount: () => number;
  clearActiveChat: () => void;
  getLastTurnEvents: () => string[];
  getLastDomain: () => string;
}

declare global {
  interface Window {
    __agentAPI?: AgentAPI;
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMessage(
  role: ChatMessage['role'],
  content: string,
  errorMeta?: ChatMessage['errorMeta'],
): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    createdAt: Date.now(),
    ...(errorMeta ? { errorMeta } : {}),
  };
}

function looksDefaultTitle(title: string): boolean {
  return /^Chat \d+$/.test(title.trim());
}

function buildChatTitleFromMessage(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New Chat';
  return normalized.length > 40 ? `${normalized.slice(0, 40)}…` : normalized;
}

function withoutStreamOverlay(chat: ChatSessionState): ChatSessionState {
  const nextScene = removeStreamOverlayFromScene(chat.scene);
  const nextBatches = removeStreamOverlayFromBatches(chat.batches);
  if (nextScene === chat.scene && nextBatches === chat.batches) return chat;
  return {
    ...chat,
    scene: nextScene,
    batches: nextBatches,
  };
}

/** Replay a batches array to reconstruct the flat element scene. */
function rebuildSceneFromBatches(batches: DrawBatch[]): DrawElement[] {
  const scene: DrawElement[] = [];
  for (const batch of batches) {
    if (batch.elements.some((el) => el.type === 'clear')) {
      scene.length = 0;
    }
    for (const el of batch.elements) {
      if (el.type !== 'clear') scene.push(el);
    }
  }
  return scene;
}

export function AppShell() {
  const {
    chatSessions,
    setChatSessions,
    activeChatId,
    activeChat,
    activeChatIdRef,
    didRestoreSession,
    sessionId,
    createChat: createChatBase,
    selectChat: selectChatBase,
    deleteChat: deleteChatBase,
    panelSizes,
    setPanelSizes,
  } = useSessionManager();

  const [appMode] = useState<AppMode>(() => {
    if (typeof window === 'undefined') return getInitialAppMode();
    return getClientAppMode(window.location.search);
  });
  const isAgentMode = appMode === 'agent';
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'thinking' | 'streaming' | 'drawing'>('idle');
  const [agentRunning, setAgentRunning] = useState(() => appMode === 'agent');
  const [agentLastQuery, setAgentLastQuery] = useState('');
  const [agentDomainIndex, setAgentDomainIndex] = useState(0);
  const [mobileActivePanel, setMobileActivePanel] = useState<'whiteboard' | 'chat' | 'draw'>('whiteboard');

  // Drawing progress tracking
  const [drawingElementCount, setDrawingElementCount] = useState(0);
  const [drawingTypeCounts, setDrawingTypeCounts] = useState<Partial<Record<DrawElement['type'], number>>>({});
  const [batchJustCompleted, setBatchJustCompleted] = useState(false);
  const [lastDrawSource, setLastDrawSource] = useState<DrawSource>('None');
  const [drawingPillState, setDrawingPillState] = useState<DrawingPillState>({ kind: 'idle' });
  const batchCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const injectorToggleRef = useRef<(() => void) | null>(null);
  const streamChatIdRef = useRef<string | null>(null);
  const currentAssistantMessageId = useRef<string | null>(null);
  const turnHadRenderableOutputRef = useRef(false);
  const turnSawToolBatchRef = useRef(false);
  const agentQueryEngineRef = useRef(new QueryEngine());
  const agentDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partialCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTurnEventsRef = useRef<string[]>([]);
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
  const { run, cancel } = useAgentStream();

  // --- Undo / Redo history ---
  const {
    canUndo, canRedo,
    pushState: pushHistoryState,
    undo: historyUndo,
    redo: historyRedo,
  } = useDrawHistory(activeChatId, activeChat?.batches ?? []);

  // Stable refs so the streaming event handler can call pushState without a
  // stale closure (handleEvent's deps intentionally exclude draw-history).
  const pushHistoryRef = useRef(pushHistoryState);
  pushHistoryRef.current = pushHistoryState;
  const activeBatchesRef = useRef<DrawBatch[]>(activeChat?.batches ?? []);
  if (activeChat) activeBatchesRef.current = activeChat.batches;

  // STATE-001: Buffering for deterministic cross-channel batch ordering
  const nextExpectedSeqRef = useRef(1);
  const pendingBatchEventsRef = useRef<Map<number, AgentSSEEvent & { type: 'whiteboard.batch' }>>(new Map());

  const resetStreamState = useCallback(() => {
    if (partialCompletionTimerRef.current) {
      clearTimeout(partialCompletionTimerRef.current);
      partialCompletionTimerRef.current = null;
    }
    if (batchCompletionTimerRef.current) {
      clearTimeout(batchCompletionTimerRef.current);
      batchCompletionTimerRef.current = null;
    }
    streamChatIdRef.current = null;
    currentAssistantMessageId.current = null;
    turnHadRenderableOutputRef.current = false;
    turnSawToolBatchRef.current = false;
    pendingDiagnosticsRef.current.clear();
    setDrawingElementCount(0);
    setDrawingTypeCounts({});
    setBatchJustCompleted(false);
    setDrawingPillState({ kind: 'idle' });
  }, []);

  const pushTurnEvent = useCallback((event: unknown) => {
    lastTurnEventsRef.current.push(JSON.stringify(event));
    if (lastTurnEventsRef.current.length > 80) {
      lastTurnEventsRef.current = lastTurnEventsRef.current.slice(-80);
    }
  }, []);

  const pushWarning = useCallback((warning: string, chatIdOverride?: string, severity: NotificationItem['severity'] = 'warning') => {
    const targetChatId = chatIdOverride ?? streamChatIdRef.current ?? activeChatIdRef.current;
    if (!targetChatId) return;

    setChatSessions((prev) =>
      prev.map((chat) => {
        if (chat.id !== targetChatId) return chat;
        if (chat.warnings[chat.warnings.length - 1]?.message === warning) return chat;
        const item: NotificationItem = { id: createId(), message: warning, severity };
        return {
          ...chat,
          updatedAt: Date.now(),
          warnings: [...chat.warnings, item].slice(-8),
        };
      }),
    );
  }, []);

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
        // STATE-001: deterministic cross-channel batch ordering.
        // If the batch has a sequenceNumber, buffer out-of-order arrivals
        // and apply them in monotonically increasing order.
        const seq = event.batch.sequenceNumber;
        if (seq != null && seq > nextExpectedSeqRef.current) {
          pendingBatchEventsRef.current.set(seq, event);
          return;
        }

        const applyBatch = (batchEvent: AgentSSEEvent & { type: 'whiteboard.batch' }) => {
          turnHadRenderableOutputRef.current = true;
          const isProvisionalStreamBatch = batchEvent.batch.batch_id.startsWith('stream-provisional-');
          const firstToolBatch = !isProvisionalStreamBatch && !turnSawToolBatchRef.current;

          // Snapshot batches before the first real batch of this turn so the
          // entire turn can be undone in a single step.
          if (firstToolBatch) {
            pushHistoryRef.current(activeBatchesRef.current);
          }

          if (!isProvisionalStreamBatch) {
            turnSawToolBatchRef.current = true;
          }
          const diagnostics = pendingDiagnosticsRef.current.get(batchEvent.batch.batch_id);
          if (diagnostics) pendingDiagnosticsRef.current.delete(batchEvent.batch.batch_id);
          setStatus('drawing');

          // Track drawing progress for UI feedback
          const drawableElements = batchEvent.batch.elements.filter((el) => el.type !== 'clear');
          const batchTypeCounts: Partial<Record<DrawElement['type'], number>> = {};
          for (const el of drawableElements) {
            batchTypeCounts[el.type] = (batchTypeCounts[el.type] ?? 0) + 1;
          }
          setDrawingElementCount((prev) => prev + drawableElements.length);
          setDrawingTypeCounts((prev) => {
            const merged = { ...prev };
            for (const [type, count] of Object.entries(batchTypeCounts)) {
              const key = type as DrawElement['type'];
              merged[key] = (merged[key] ?? 0) + (count ?? 0);
            }
            return merged;
          });
          setLastDrawSource('AI');
          setDrawingPillState({ kind: 'ai_drawing', elementCount: drawableElements.length, typeCounts: batchTypeCounts });

          // Flash batch completion
          setBatchJustCompleted(true);
          if (batchCompletionTimerRef.current) clearTimeout(batchCompletionTimerRef.current);
          batchCompletionTimerRef.current = setTimeout(() => {
            batchCompletionTimerRef.current = null;
            setBatchJustCompleted(false);
          }, 1500);

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
          // Drain any buffered batches that are now in order
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
        // Show done pill briefly if we drew shapes, then reset
        if (turnSawToolBatchRef.current) {
          setDrawingPillState((prev) =>
            prev.kind === 'ai_drawing'
              ? { kind: 'done', shapeCount: prev.elementCount, typeCounts: prev.typeCounts }
              : { kind: 'done', shapeCount: 0 },
          );
        }
        resetStreamState();
        setStatus('idle');
      }
    },
    [pushTurnEvent, pushWarning, resetStreamState],
  );

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
            const targetChatId = streamChatIdRef.current ?? activeChatIdRef.current;
            const hadRenderableOutput = turnHadRenderableOutputRef.current;
            resetStreamState();
            setStatus('idle');
            pushTurnEvent({ type: 'client.error', message: msg });
            if (!targetChatId) return;
            if (hadRenderableOutput) return;

            setChatSessions((prev) =>
              prev.map((chat) =>
                chat.id === targetChatId
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
    [activeChat, handleEvent, pushTurnEvent, resetStreamState, run, sessionId, status],
  );

  const send = useCallback(() => {
    const sent = sendMessage(input);
    if (sent) setInput('');
  }, [input, sendMessage]);

  const createChat = useCallback(() => {
    if (status !== 'idle') return;
    createChatBase();
    setInput('');
    resetStreamState();
  }, [createChatBase, resetStreamState, status]);

  const selectChat = useCallback(
    (chatId: string) => {
      selectChatBase(chatId, {
        cancel,
        resetStreamState,
        streamChatId: streamChatIdRef.current,
      });
      setInput('');
    },
    [cancel, resetStreamState, selectChatBase],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      if (status !== 'idle') return;

      deleteChatBase(chatId, {
        cancel,
        resetStreamState: () => {
          setStatus('idle');
          resetStreamState();
        },
        streamChatId: streamChatIdRef.current,
      });

      setInput('');
    },
    [cancel, deleteChatBase, resetStreamState, status],
  );

  const clearActiveChat = useCallback(() => {
    if (!activeChat || status !== 'idle') return;

    pushHistoryState(activeChat.batches);
    resetStreamState();

    const clearBatch: DrawBatch = {
      batch_id: `clear-${createId()}`,
      style_preset: 'clean_pen_sketch',
      elements: [{ id: `clear-${createId()}`, type: 'clear' }],
    };

    setChatSessions((prev) =>
      prev.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              updatedAt: Date.now(),
              messages: [],
              scene: [],
              semanticScene: [],
              plannerMeta: [],
              warnings: [],
              batches: [clearBatch],
            }
          : chat,
      ),
    );
  }, [activeChat, pushHistoryState, resetStreamState, status]);

  const clearForAgent = useCallback(() => {
    clearActiveChat();
    setAgentLastQuery('');
    lastTurnEventsRef.current = [];
  }, [clearActiveChat]);

  const AGENT_SCENE_LIMIT = 60;
  const AGENT_INTER_TURN_DELAY_MS = 2000;

  useEffect(() => {
    if (!isAgentMode || !agentRunning) return;
    if (status !== 'idle') return;

    // Auto-clear scene only (preserve domain progress) when crowded
    if (activeChat.scene.length > AGENT_SCENE_LIMIT) {
      agentDelayRef.current = setTimeout(() => {
        agentDelayRef.current = null;
        clearForAgent();
      }, 0);
      return () => {
        if (agentDelayRef.current) {
          clearTimeout(agentDelayRef.current);
          agentDelayRef.current = null;
        }
      };
    }

    // Inter-turn delay to prevent rapid-fire queries
    agentDelayRef.current = setTimeout(() => {
      agentDelayRef.current = null;
      const domain = AGENT_DOMAINS[agentDomainIndex % AGENT_DOMAINS.length]!;
      const query = agentQueryEngineRef.current.generate(domain);
      const sent = sendMessage(query);
      if (!sent) return;

      setAgentLastQuery(query);
      setAgentDomainIndex((prev) => prev + 1);
    }, AGENT_INTER_TURN_DELAY_MS);

    return () => {
      if (agentDelayRef.current) {
        clearTimeout(agentDelayRef.current);
        agentDelayRef.current = null;
      }
    };
  }, [activeChat.scene.length, agentDomainIndex, agentRunning, clearForAgent, isAgentMode, sendMessage, status]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isAgentMode || !activeChat) return;

    window.__agentAPI = {
      submitQuery: async (text: string) => {
        sendMessage(text);
      },
      getStatus: () => status,
      getMessages: () => activeChat.messages.map((m) => ({ role: m.role, content: m.content })),
      getElementCount: () => activeChat.scene.length,
      clearActiveChat: clearForAgent,
      getLastTurnEvents: () => [...lastTurnEventsRef.current],
      getLastDomain: () => {
        const idx = Math.max(0, agentDomainIndex - 1);
        return AGENT_DOMAINS[idx % AGENT_DOMAINS.length]!;
      },
    };

    return () => {
      delete window.__agentAPI;
    };
  }, [activeChat, agentDomainIndex, clearForAgent, isAgentMode, sendMessage, status]);

  const resizeBy = useCallback((delta: number) => {
    setPanelSizes(([left]) => {
      const nextLeft = Math.min(75, Math.max(42, left + delta));
      return [nextLeft, 100 - nextLeft];
    });
  }, []);

  const chatMeta = useMemo<ChatThreadMeta[]>(
    () =>
      chatSessions.map((chat) => ({
        id: chat.id,
        title: chat.title,
        messageCount: chat.messages.length,
      })),
    [chatSessions],
  );

  const statusLabel =
    status === 'idle'
      ? 'Ready'
      : status === 'thinking'
        ? 'Thinking'
        : status === 'streaming'
          ? 'Responding'
          : 'Drawing';
  const agentDomain = AGENT_DOMAINS[agentDomainIndex % AGENT_DOMAINS.length]!;

  // Derived stream phase for ChatPanel → StreamProgress
  const streamPhase: StreamPhase | undefined =
    status === 'thinking'
      ? 'thinking'
      : status === 'streaming'
        ? 'streaming_text'
        : status === 'drawing'
          ? 'drawing'
          : undefined;

  const drawingProgress: DrawingProgressInfo | undefined =
    status === 'drawing'
      ? {
          elementCount: drawingElementCount,
          typeCounts: drawingTypeCounts,
          batchJustCompleted,
        }
      : undefined;

  // --- Undo / Redo restore ---
  const restoreFromBatches = useCallback(
    (batches: DrawBatch[]) => {
      const scene = rebuildSceneFromBatches(batches);
      const semanticScene = batches
        .map((b) => fromLegacyDrawBatchToSemanticStub(b.batch_id, b.elements))
        .slice(-80);
      setChatSessions((prev) =>
        prev.map((chat) => {
          if (chat.id !== activeChatIdRef.current) return chat;
          return { ...chat, updatedAt: Date.now(), batches, scene, semanticScene };
        }),
      );
    },
    [setChatSessions],
  );

  const handleUndo = useCallback(() => {
    if (status !== 'idle') return;
    const batches = historyUndo();
    if (batches) restoreFromBatches(batches);
  }, [historyUndo, restoreFromBatches, status]);

  const handleRedo = useCallback(() => {
    if (status !== 'idle') return;
    const batches = historyRedo();
    if (batches) restoreFromBatches(batches);
  }, [historyRedo, restoreFromBatches, status]);

  useKeyboardShortcuts(
    useMemo(
      () => ({
        focusInput: () => chatInputRef.current?.focus(),
        newChat: () => createChat(),
        cancelStream: () => {
          if (status !== 'idle') {
            cancel();
            resetStreamState();
            setStatus('idle');
          }
        },
        prevChat: () => {
          const idx = chatSessions.findIndex((c) => c.id === activeChatId);
          if (idx > 0) selectChat(chatSessions[idx - 1]!.id);
        },
        nextChat: () => {
          const idx = chatSessions.findIndex((c) => c.id === activeChatId);
          if (idx < chatSessions.length - 1) selectChat(chatSessions[idx + 1]!.id);
        },
        togglePanel: () =>
          setMobileActivePanel((p) => (p === 'whiteboard' ? 'chat' : 'whiteboard')),
        toggleInjector: () => injectorToggleRef.current?.(),
        undo: handleUndo,
        redo: handleRedo,
      }),
      [activeChatId, cancel, chatSessions, createChat, handleRedo, handleUndo, resetStreamState, selectChat, status],
    ),
  );

  const dismissWarnings = useCallback(() => {
    if (!activeChat) return;
    setChatSessions((prev) =>
      prev.map((chat) =>
        chat.id === activeChat.id ? { ...chat, warnings: [] } : chat,
      ),
    );
  }, [activeChat, setChatSessions]);

  const dismissOneWarning = useCallback(
    (notificationId: string) => {
      if (!activeChat) return;
      setChatSessions((prev) =>
        prev.map((chat) =>
          chat.id === activeChat.id
            ? { ...chat, warnings: chat.warnings.filter((w) => w.id !== notificationId) }
            : chat,
        ),
      );
    },
    [activeChat, setChatSessions],
  );

  const handleDrawInject = useCallback(
    (batch: DrawBatch) => {
      if (!activeChat) return;
      pushHistoryState(activeChat.batches);

      // Determine source from batch_id prefix
      const source: DrawSource = batch.batch_id.startsWith('tpl-') ? 'Template' : 'Injected';
      setLastDrawSource(source);
      const drawableEls = batch.elements.filter((el) => el.type !== 'clear');
      const injectCount = drawableEls.length;
      const injectTypeCounts: Partial<Record<DrawElement['type'], number>> = {};
      for (const el of drawableEls) {
        injectTypeCounts[el.type] = (injectTypeCounts[el.type] ?? 0) + 1;
      }
      setDrawingPillState({ kind: 'done', shapeCount: injectCount, typeCounts: injectTypeCounts });

      // Build type breakdown for toast
      const typeBreakdown = Object.entries(injectTypeCounts)
        .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
        .slice(0, 3)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ');
      const toastMsg = typeBreakdown
        ? `✓ Injected ${injectCount} element${injectCount !== 1 ? 's' : ''} (${typeBreakdown})`
        : `✓ ${injectCount} element${injectCount !== 1 ? 's' : ''} injected`;
      pushWarning(toastMsg, activeChat.id, 'success');

      const hasClear = batch.elements.some((el) => el.type === 'clear');
      setChatSessions((prev) =>
        prev.map((chat) => {
          if (chat.id !== activeChat.id) return chat;
          const baseScene = hasClear ? [] : [...chat.scene];
          batch.elements.forEach((element) => {
            if (element.type !== 'clear') baseScene.push(element);
          });
          const semanticBatch = fromLegacyDrawBatchToSemanticStub(batch.batch_id, batch.elements);
          return {
            ...chat,
            updatedAt: Date.now(),
            scene: baseScene,
            semanticScene: [...chat.semanticScene, semanticBatch].slice(-80),
            batches: [...chat.batches, batch],
          };
        }),
      );
    },
    [activeChat, pushHistoryState, pushWarning, setChatSessions],
  );

  const handleCopySceneJson = useCallback(() => {
    const scene = chatSessions.find((c) => c.id === activeChatId)?.scene ?? [];
    const batch: DrawBatch = {
      batch_id: `export-${Date.now()}`,
      elements: scene,
      source: 'injection' as const,
      schemaVersion: 1,
    };
    navigator.clipboard.writeText(JSON.stringify(batch, null, 2)).then(
      () => {
        const targetId = activeChatIdRef.current;
        if (targetId) {
          pushWarning(`✓ Copied ${scene.length} element${scene.length !== 1 ? 's' : ''} as JSON`, targetId, 'success');
        }
      },
      () => {
        const targetId = activeChatIdRef.current;
        if (targetId) {
          pushWarning('Failed to copy to clipboard', targetId, 'error');
        }
      },
    );
  }, [chatSessions, activeChatId, pushWarning]);

  if (!didRestoreSession) {
    return (
      <ErrorBoundary>
        <main className="relative h-screen w-screen overflow-hidden p-2 sm:p-4" style={{ height: '100dvh' }}>
          <div className="app-card glass-panel flex h-full min-h-0 flex-col overflow-hidden border-[var(--color-border)]">
            <div className="h-14 border-b border-[var(--color-border)]" />
            <div className="flex flex-1 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            </div>
          </div>
        </main>
      </ErrorBoundary>
    );
  }

  if (!activeChat) return null;

  return (
    <ErrorBoundary>
    <main id="main-content" className="relative h-screen w-screen overflow-hidden p-2 text-[var(--color-text-primary)] sm:p-4" style={{ height: '100dvh' }}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-[var(--color-surface)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--color-text-primary)] focus:shadow-lg">Skip to main content</a>
      <div className="app-card glass-panel animate-rise-in relative flex h-full min-h-0 flex-col overflow-hidden border-[var(--color-border)]">
        <AppHeader status={status} canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo} />

        <div
          className="relative flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row"
          style={{ ['--left-width' as string]: `${panelSizes[0]}%` }}
        >
          <section
            id="panel-whiteboard"
            data-testid="whiteboard-canvas"
            tabIndex={-1}
            className={`relative ${isAgentMode ? 'h-full w-full' : 'min-h-0 w-full flex-1 md:h-full md:w-[var(--left-width)]'}`}
          >
            <WhiteboardCanvas
              key={activeChat.id}
              batches={activeChat.batches}
              onWarning={(warning) => pushWarning(warning, activeChat.id)}
            />
            <DrawingStatusPill state={drawingPillState} />
            <DrawingStatistics
              scene={activeChat.scene}
              batches={activeChat.batches}
              lastDrawSource={lastDrawSource}
              onCopyScene={handleCopySceneJson}
            />
            {!isAgentMode && (
              <DrawPayloadInjector onInject={handleDrawInject} sessionId={activeChat.id} forceOpen={mobileActivePanel === 'draw'} toggleRef={injectorToggleRef} />
            )}
          </section>

          {!isAgentMode && (
            <div
              role="separator"
              aria-orientation="vertical"
              className="group relative hidden w-2 cursor-col-resize rounded-full bg-transparent md:block"
              onPointerDown={(e) => {
                let lastX = e.clientX;
                const target = e.currentTarget;
                target.setPointerCapture(e.pointerId);

                const onMove = (ev: PointerEvent) => {
                  const dx = ev.clientX - lastX;
                  lastX = ev.clientX;
                  const containerWidth = target.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
                  resizeBy((dx / containerWidth) * 100);
                };
                const onUp = () => {
                  target.removeEventListener('pointermove', onMove);
                  target.removeEventListener('pointerup', onUp);
                };

                target.addEventListener('pointermove', onMove);
                target.addEventListener('pointerup', onUp);
              }}
            >
              <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-[var(--color-border)]/80" />
              <div className="absolute inset-y-1/2 left-1/2 h-14 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-accent)]/30 transition group-hover:bg-[var(--color-accent)]/65" />
            </div>
          )}

          {!isAgentMode && (
            <section
              id="panel-chat"
              data-testid="chat-panel"
              tabIndex={-1}
              className="min-h-0 w-full flex-1 md:h-full md:flex-1"
            >
              <ChatPanel
                chats={chatMeta}
                activeChatId={activeChat.id}
                messages={activeChat.messages}
                input={input}
                status={status}
                streamPhase={streamPhase}
                drawingProgress={drawingProgress}
                inputRef={chatInputRef}
                onInput={setInput}
                onSend={send}
                onCancel={() => {
                  cancel();
                  resetStreamState();
                  setStatus('idle');
                }}
                onSelectChat={selectChat}
                onCreateChat={createChat}
                onDeleteChat={deleteChat}
                onDeleteMessage={(messageId) => {
                  if (currentAssistantMessageId.current === messageId) {
                    currentAssistantMessageId.current = null;
                  }
                  setChatSessions((prev) =>
                    prev.map((chat) =>
                      chat.id === activeChat.id
                        ? {
                            ...chat,
                            updatedAt: Date.now(),
                            messages: chat.messages.filter((m) => m.id !== messageId),
                          }
                        : chat,
                    ),
                  );
                }}
                onClearChat={clearActiveChat}
                onRetry={(lastUserMessage) => {
                  sendMessage(lastUserMessage);
                }}
                disabled={status !== 'idle'}
              />
            </section>
          )}

          {isAgentMode && (
            <AgentSidebar
              agentDomain={agentDomain}
              statusLabel={statusLabel}
              agentLastQuery={agentLastQuery}
              agentRunning={agentRunning}
              onToggleAgent={() => setAgentRunning((prev) => !prev)}
              onClear={clearForAgent}
            />
          )}

          <WarningOverlay
            notifications={activeChat.warnings}
            onDismissOne={dismissOneWarning}
            onDismissAll={dismissWarnings}
          />
        </div>
      </div>
      {!isAgentMode && (
        <MobilePanelSwitcher
          activePanel={mobileActivePanel}
          onSwitch={setMobileActivePanel}
        />
      )}
    </main>
    </ErrorBoundary>
  );
}
