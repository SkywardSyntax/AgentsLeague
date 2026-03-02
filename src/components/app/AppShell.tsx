'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatPanel, type ChatThreadMeta } from '@/components/chat/ChatPanel';
import { WhiteboardCanvas } from '@/components/whiteboard/WhiteboardCanvas';
import { useAgentStream } from '@/hooks/useAgentStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { AGENT_DOMAINS, QueryEngine } from '@/lib/agent/queryEngine';
import { loadSession, saveSession } from '@/lib/client/persistence';
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
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MobilePanelSwitcher } from '@/components/app/MobilePanelSwitcher';

interface ChatSessionState {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  scene: DrawElement[];
  semanticScene: SemanticBatch[];
  plannerMeta: WhiteboardLayoutDiagnostics[];
  batches: DrawBatch[];
  warnings: string[];
}

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

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    createdAt: Date.now(),
  };
}

function defaultChatTitle(index: number): string {
  return `Chat ${index}`;
}

function looksDefaultTitle(title: string): boolean {
  return /^Chat \d+$/.test(title.trim());
}

function buildChatTitleFromMessage(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New Chat';
  return normalized.length > 40 ? `${normalized.slice(0, 40)}…` : normalized;
}

function buildRestoreBatch(chatId: string, scene: DrawElement[]): DrawBatch[] {
  if (scene.length === 0) return [];
  return [
    {
      batch_id: `restore-${chatId}-${Date.now()}`,
      style_preset: 'clean_pen_sketch',
      elements: scene,
    },
  ];
}

function createEmptyChatSession(index: number): ChatSessionState {
  const now = Date.now();
  return {
    id: createId(),
    title: defaultChatTitle(index),
    createdAt: now,
    updatedAt: now,
    messages: [],
    scene: [],
    semanticScene: [],
    plannerMeta: [],
    batches: [],
    warnings: [],
  };
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

export function AppShell() {
  const [appMode, setAppMode] = useState<AppMode>(() => getInitialAppMode());
  const isAgentMode = appMode === 'agent';
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'thinking' | 'streaming' | 'drawing'>('idle');
  const [panelSizes, setPanelSizes] = useState<[number, number]>([62, 38]);
  const [agentRunning, setAgentRunning] = useState(isAgentMode);
  const [agentLastQuery, setAgentLastQuery] = useState('');
  const [agentDomainIndex, setAgentDomainIndex] = useState(0);
  const [didRestoreSession, setDidRestoreSession] = useState(false);
  const [seedChat] = useState<ChatSessionState>(() => createEmptyChatSession(1));
  const [mobileActivePanel, setMobileActivePanel] = useState<'whiteboard' | 'chat'>('whiteboard');

  const [chatSessions, setChatSessions] = useState<ChatSessionState[]>([seedChat]);
  const [activeChatId, setActiveChatId] = useState<string>(seedChat.id);

  const [sessionId] = useState(() => createId());
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const activeChatIdRef = useRef<string>(activeChatId);
  const streamChatIdRef = useRef<string | null>(null);
  const currentAssistantMessageId = useRef<string | null>(null);
  const turnHadRenderableOutputRef = useRef(false);
  const turnSawToolBatchRef = useRef(false);
  const agentQueryEngineRef = useRef(new QueryEngine());
  const agentDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTurnEventsRef = useRef<string[]>([]);
  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const resetStreamState = useCallback(() => {
    streamChatIdRef.current = null;
    currentAssistantMessageId.current = null;
    turnHadRenderableOutputRef.current = false;
    turnSawToolBatchRef.current = false;
    pendingDiagnosticsRef.current.clear();
  }, []);

  const activeChat = useMemo(
    () => chatSessions.find((chat) => chat.id === activeChatId) ?? chatSessions[0] ?? null,
    [activeChatId, chatSessions],
  );

  useEffect(() => {
    setAppMode(getClientAppMode(window.location.search));
  }, []);

  useEffect(() => {
    if (isAgentMode) setAgentRunning(true);
  }, [isAgentMode]);

  useEffect(() => {
    activeChatIdRef.current = activeChat?.id ?? '';
  }, [activeChat?.id]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const restored = loadSession();
    if (restored && restored.chats.length > 0) {
      const restoredChats: ChatSessionState[] = restored.chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: chat.messages,
        scene: chat.scene,
        semanticScene: chat.semanticScene ?? [],
        plannerMeta: chat.plannerMeta ?? [],
        batches: buildRestoreBatch(chat.id, chat.scene),
        warnings: [],
      }));

      setChatSessions(restoredChats);
      setPanelSizes(restored.prefs.panelSizes);

      const activeExists = restoredChats.some((chat) => chat.id === restored.activeChatId);
      setActiveChatId(activeExists ? restored.activeChatId : restoredChats[0]!.id);
    }

    setDidRestoreSession(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!didRestoreSession) return;
    if (persistTimeout.current) clearTimeout(persistTimeout.current);

    persistTimeout.current = setTimeout(() => {
      if (chatSessions.length === 0) return;
      saveSession({
        version: 3,
        updatedAt: Date.now(),
        activeChatId: activeChat?.id ?? chatSessions[0]!.id,
        chats: chatSessions.map((chat) => ({
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          messages: chat.messages,
          scene: chat.scene,
          semanticScene: chat.semanticScene,
          plannerMeta: chat.plannerMeta,
        })),
        prefs: { panelSizes },
      });
    }, 500);

    return () => {
      if (persistTimeout.current) clearTimeout(persistTimeout.current);
    };
  }, [activeChat?.id, chatSessions, didRestoreSession, panelSizes]);

  const pushWarning = useCallback((warning: string, chatIdOverride?: string) => {
    const targetChatId = chatIdOverride ?? streamChatIdRef.current ?? activeChatIdRef.current;
    if (!targetChatId) return;

    setChatSessions((prev) =>
      prev.map((chat) => {
        if (chat.id !== targetChatId) return chat;
        if (chat.warnings[chat.warnings.length - 1] === warning) return chat;
        return {
          ...chat,
          updatedAt: Date.now(),
          warnings: [...chat.warnings, warning].slice(-8),
        };
      }),
    );
  }, []);

  const handleEvent = useCallback(
    (event: AgentSSEEvent) => {
      lastTurnEventsRef.current.push(event.type);
      if (lastTurnEventsRef.current.length > 80) {
        lastTurnEventsRef.current = lastTurnEventsRef.current.slice(-80);
      }
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
        turnHadRenderableOutputRef.current = true;
        const isProvisionalStreamBatch = event.batch.batch_id.startsWith('stream-provisional-');
        const firstToolBatch = !isProvisionalStreamBatch && !turnSawToolBatchRef.current;
        if (!isProvisionalStreamBatch) {
          turnSawToolBatchRef.current = true;
        }
        const diagnostics = pendingDiagnosticsRef.current.get(event.batch.batch_id);
        if (diagnostics) pendingDiagnosticsRef.current.delete(event.batch.batch_id);
        setStatus('drawing');
        setChatSessions((prev) =>
          prev.map((chat) => {
            if (chat.id !== targetChatId) return chat;
            const baseChat = firstToolBatch ? withoutStreamOverlay(chat) : chat;
            const hasClear = event.batch.elements.some((el) => el.type === 'clear');
            const baseScene = hasClear ? [] : [...baseChat.scene];
            event.batch.elements.forEach((element) => {
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
              fromLegacyDrawBatchToSemanticStub(event.batch.batch_id, event.batch.elements);
            const nextSemanticScene = [...baseChat.semanticScene, semanticBatch].slice(-80);
            return {
              ...baseChat,
              updatedAt: Date.now(),
              scene: baseScene,
              semanticScene: nextSemanticScene,
              plannerMeta: nextPlannerMeta,
              batches: [...baseChat.batches, event.batch],
            };
          }),
        );
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
        setChatSessions((prev) =>
          prev.map((chat) =>
            chat.id === targetChatId
              ? {
                  ...chat,
                  updatedAt: Date.now(),
                  messages: [...chat.messages, createMessage('assistant', `Error: ${event.message}`)],
                }
              : chat,
          ),
        );
        return;
      }

      if (event.type === 'turn.done') {
        setChatSessions((prev) =>
          prev.map((chat) => {
            if (chat.id !== targetChatId) return chat;
            if (turnHadRenderableOutputRef.current) return chat;
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
        resetStreamState();
        setStatus('idle');
      }
    },
    [pushWarning, resetStreamState],
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
      lastTurnEventsRef.current = ['turn.started'];

      void run({
        sessionId,
        userMessage: message,
        history,
        plannerMode: 'semantic_preferred',
        whiteboardContext,
        whiteboardContextV2,
        handlers: {
          onEvent: handleEvent,
          onError: (msg) => {
            const targetChatId = streamChatIdRef.current ?? activeChatIdRef.current;
            turnHadRenderableOutputRef.current = true;
            resetStreamState();
            setStatus('idle');
            lastTurnEventsRef.current.push('error');
            if (!targetChatId) return;

            setChatSessions((prev) =>
              prev.map((chat) =>
                chat.id === targetChatId
                  ? {
                      ...chat,
                      updatedAt: Date.now(),
                      messages: [...chat.messages, createMessage('assistant', `Stream error: ${msg}`)],
                    }
                  : chat,
              ),
            );
          },
        },
      });
      return true;
    },
    [activeChat, handleEvent, resetStreamState, run, sessionId, status],
  );

  const send = useCallback(() => {
    const sent = sendMessage(input);
    if (sent) setInput('');
  }, [input, sendMessage]);

  const createChat = useCallback(() => {
    if (status !== 'idle') return;
    const nextChat = createEmptyChatSession(chatSessions.length + 1);
    setChatSessions((prev) => [nextChat, ...prev]);
    setActiveChatId(nextChat.id);
    setInput('');
    resetStreamState();
  }, [chatSessions.length, resetStreamState, status]);

  const selectChat = useCallback(
    (chatId: string) => {
      if (status !== 'idle') return;
      if (chatId === activeChatId) return;
      setActiveChatId(chatId);
      setInput('');
      resetStreamState();
    },
    [activeChatId, resetStreamState, status],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      if (status !== 'idle') return;

      let nextActiveId: string | null = null;
      setChatSessions((prev) => {
        const index = prev.findIndex((chat) => chat.id === chatId);
        if (index === -1) return prev;

        if (prev.length === 1) {
          const replacement = createEmptyChatSession(1);
          nextActiveId = replacement.id;
          return [replacement];
        }

        const remaining = prev.filter((chat) => chat.id !== chatId);
        if (activeChatIdRef.current === chatId) {
          nextActiveId = remaining[Math.max(0, index - 1)]?.id ?? remaining[0]!.id;
        }
        return remaining;
      });

      if (streamChatIdRef.current === chatId) {
        cancel();
        setStatus('idle');
        resetStreamState();
      }

      if (nextActiveId) {
        setActiveChatId(nextActiveId);
        setInput('');
      }
    },
    [cancel, resetStreamState, status],
  );

  const clearActiveChat = useCallback(() => {
    if (!activeChat || status !== 'idle') return;

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
  }, [activeChat, resetStreamState, status]);

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

  const warningsUI = useMemo(
    () =>
      (activeChat?.warnings.length ?? 0) > 0 ? (
        <div className="absolute bottom-4 left-4 z-20 max-w-md space-y-2">
          {activeChat?.warnings.map((warning, i) => (
            <p
              key={`${warning}-${i}`}
              className="glass-panel rounded-xl border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-warning-text)] shadow-[var(--shadow-card)]"
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null,
    [activeChat.warnings],
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
        resetZoom: () => {
          /* handled by WhiteboardCanvas internally */
        },
        togglePanel: () =>
          setMobileActivePanel((p) => (p === 'whiteboard' ? 'chat' : 'whiteboard')),
      }),
      [activeChatId, cancel, chatSessions, createChat, resetStreamState, selectChat, status],
    ),
  );

  if (!didRestoreSession) {
    return (
      <main className="relative h-screen w-screen overflow-hidden p-2 sm:p-4" style={{ height: '100dvh' }}>
        <div className="app-card glass-panel flex h-full min-h-0 flex-col overflow-hidden border-[var(--color-border)]">
          <div className="h-14 border-b border-[var(--color-border)]" />
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          </div>
        </div>
      </main>
    );
  }

  if (!activeChat) return null;

  return (
    <main className="relative h-screen w-screen overflow-hidden p-2 text-[var(--color-text-primary)] sm:p-4" style={{ height: '100dvh' }}>
      <div className="app-card glass-panel animate-rise-in relative flex h-full min-h-0 flex-col overflow-hidden border-[var(--color-border)]">
        <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4 sm:px-5">
          <div>
            <h1 className="font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
              AgentsLeague
            </h1>
            <p className="text-[11px] text-[var(--color-text-muted)]">Interleaved conversational whiteboard</p>
          </div>
          <StatusBadge status={status} />
        </header>

        <div
          className="relative flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row"
          style={{ ['--left-width' as string]: `${panelSizes[0]}%` }}
        >
          <section
            data-testid="whiteboard-canvas"
            className={isAgentMode ? 'h-full w-full' : `w-full md:h-full md:w-[var(--left-width)] ${mobileActivePanel === 'whiteboard' ? 'h-full' : 'hidden'} md:!block`}
            {...(mobileActivePanel !== 'whiteboard' && !isAgentMode ? { inert: true, 'aria-hidden': true } : {})}
          >
            <WhiteboardCanvas
              key={activeChat.id}
              batches={activeChat.batches}
              onWarning={(warning) => pushWarning(warning, activeChat.id)}
            />
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
              data-testid="chat-panel"
              className={`min-h-0 w-full md:h-full md:flex-1 ${mobileActivePanel === 'chat' ? 'h-full' : 'hidden'} md:!block`}
              {...(mobileActivePanel !== 'chat' ? { inert: true, 'aria-hidden': true } : {})}
            >
              <ChatPanel
                chats={chatMeta}
                activeChatId={activeChat.id}
                messages={activeChat.messages}
                input={input}
                status={status}
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
                disabled={status !== 'idle'}
              />
            </section>
          )}

          {isAgentMode && (
            <aside data-testid="agent-sidebar" className="absolute right-4 top-4 z-20 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-3 shadow-lg backdrop-blur">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Agent Mode</p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Domain: <span data-testid="agent-domain" className="font-medium">{agentDomain}</span> · Status: {statusLabel}
              </p>
              <p data-testid="agent-last-query" className="mt-2 line-clamp-3 text-xs text-[var(--color-text-muted)]">
                Last query: {agentLastQuery || '—'}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  data-testid="agent-toggle"
                  onClick={() => setAgentRunning((prev) => !prev)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface-soft)]"
                >
                  {agentRunning ? 'Pause agent' : 'Resume agent'}
                </button>
                <button
                  type="button"
                  data-testid="agent-clear"
                  onClick={clearForAgent}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface-soft)]"
                >
                  Clear
                </button>
              </div>
            </aside>
          )}

          {warningsUI}
        </div>
      </div>
      {!isAgentMode && (
        <MobilePanelSwitcher
          activePanel={mobileActivePanel}
          onSwitch={setMobileActivePanel}
        />
      )}
    </main>
  );
}
