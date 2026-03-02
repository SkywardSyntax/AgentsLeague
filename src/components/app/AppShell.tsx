'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ChatPanel, type ChatThreadMeta } from '@/components/chat/ChatPanel';
import { WhiteboardCanvas } from '@/components/whiteboard/WhiteboardCanvas';
import { useAgentStream } from '@/hooks/useAgentStream';
import { AGENT_DOMAINS, QueryEngine } from '@/lib/agent/queryEngine';
import { loadSession, saveSession } from '@/lib/client/persistence';
import { type AppMode, getClientAppMode, getInitialAppMode } from '@/lib/mode';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '@/lib/whiteboard/context';
import type { AgentSSEEvent, DrawBatch } from '@/types/agent';
import {
  type ChatStore,
  buildRestoreBatch,
  chatSessionReducer,
  createEmptyChatSession,
  createInitialTurn,
  createMessage,
  withoutStreamOverlay,
} from '@/lib/state/chatSessionReducer';

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

export function AppShell() {
  const [appMode, setAppMode] = useState<AppMode>(() => getInitialAppMode());
  const isAgentMode = appMode === 'agent';
  const [input, setInput] = useState('');
  const [panelSizes, setPanelSizes] = useState<[number, number]>([62, 38]);
  const [agentRunning, setAgentRunning] = useState(isAgentMode);
  const [agentLastQuery, setAgentLastQuery] = useState('');
  const [agentDomainIndex, setAgentDomainIndex] = useState(0);
  const [didRestoreSession, setDidRestoreSession] = useState(false);
  const [seedChat] = useState(() => createEmptyChatSession(1));

  const [chatStore, dispatch] = useReducer(chatSessionReducer, undefined, (): ChatStore => ({
    chatOrder: [seedChat.id],
    chats: { [seedChat.id]: seedChat },
    turn: createInitialTurn(),
  }));
  const [activeChatId, setActiveChatId] = useState<string>(seedChat.id);

  const status = chatStore.turn.status;
  const [sessionId] = useState(() => createId());
  const activeChatIdRef = useRef<string>(activeChatId);
  const agentQueryEngineRef = useRef(new QueryEngine());
  const agentDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTurnEventsRef = useRef<string[]>([]);
  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { run, cancel } = useAgentStream();

  const activeChat = useMemo(
    () => chatStore.chats[activeChatId] ?? chatStore.chats[chatStore.chatOrder[0]!] ?? null,
    [activeChatId, chatStore],
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
      const activeExists = restored.chats.some((chat) => chat.id === restored.activeChatId);
      const activeId = activeExists ? restored.activeChatId : restored.chats[0]!.id;

      const newChats: Record<string, import('@/lib/state/chatSessionReducer').ChatSessionState> = {};
      const newOrder: string[] = [];
      for (const chat of restored.chats) {
        newOrder.push(chat.id);
        newChats[chat.id] = {
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          messages: chat.messages,
          scene: chat.scene,
          semanticScene: chat.semanticScene ?? [],
          plannerMeta: chat.plannerMeta ?? [],
          batches: chat.id === activeId ? buildRestoreBatch(chat.id, chat.scene) : [],
          warnings: [],
        };
      }

      dispatch({ type: 'RESTORE_SESSION', chats: newChats, chatOrder: newOrder });
      setPanelSizes(restored.prefs.panelSizes);
      setActiveChatId(activeId);
    }

    setDidRestoreSession(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!didRestoreSession) return;
    if (persistTimeout.current) clearTimeout(persistTimeout.current);

    persistTimeout.current = setTimeout(() => {
      if (chatStore.chatOrder.length === 0) return;
      saveSession({
        version: 3,
        updatedAt: Date.now(),
        activeChatId: activeChat?.id ?? chatStore.chatOrder[0]!,
        chats: chatStore.chatOrder.map((id) => {
          const chat = withoutStreamOverlay(chatStore.chats[id]!);
          return {
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            messages: chat.messages,
            scene: chat.scene,
            semanticScene: chat.semanticScene,
            plannerMeta: chat.plannerMeta,
            warnings: chat.warnings.length > 0 ? chat.warnings : undefined,
          };
        }),
        prefs: { panelSizes },
      });
    }, 500);

    return () => {
      if (persistTimeout.current) clearTimeout(persistTimeout.current);
    };
  }, [activeChat?.id, chatStore, didRestoreSession, panelSizes]);

  const pushWarning = useCallback((warning: string, chatIdOverride?: string) => {
    const targetChatId = chatIdOverride ?? chatStore.turn.streamChatId ?? activeChatIdRef.current;
    if (!targetChatId) return;
    dispatch({ type: 'PUSH_WARNING', chatId: targetChatId, warning });
  }, [chatStore.turn.streamChatId]);

  const handleEvent = useCallback(
    (event: AgentSSEEvent) => {
      try {
      lastTurnEventsRef.current.push(event.type);
      if (lastTurnEventsRef.current.length > 80) {
        lastTurnEventsRef.current = lastTurnEventsRef.current.slice(-80);
      }
      const targetChatId = chatStore.turn.streamChatId ?? activeChatIdRef.current;
      if (!targetChatId) return;

      if (event.type === 'assistant.text.delta') {
        dispatch({ type: 'APPEND_ASSISTANT_DELTA', chatId: targetChatId, delta: event.delta });
        return;
      }

      if (event.type === 'assistant.text.done') {
        dispatch({ type: 'FINALIZE_ASSISTANT_MESSAGE' });
        return;
      }

      if (event.type === 'whiteboard.batch') {
        dispatch({
          type: 'APPLY_WHITEBOARD_BATCH',
          chatId: targetChatId,
          batch: event.batch,
        });
        return;
      }

      if (event.type === 'whiteboard.layout.diagnostics') {
        dispatch({
          type: 'STORE_DIAGNOSTICS',
          batchId: event.batchId,
          entry: {
            batchId: event.batchId,
            templateUsed: event.templateUsed,
            fallbackUsed: event.fallbackUsed,
            violationsFixed: event.violationsFixed,
            semanticBatch: event.semanticBatch,
          },
        });
        return;
      }

      if (event.type === 'warning') {
        pushWarning(event.message + (event.context ? ` (${event.context})` : ''), targetChatId);
        return;
      }

      if (event.type === 'error') {
        dispatch({ type: 'TURN_ERROR', chatId: targetChatId, errorMessage: event.message });
        return;
      }

      if (event.type === 'turn.done') {
        dispatch({ type: 'TURN_DONE', chatId: targetChatId });
      }
      } catch (err) {
        console.error('[handleEvent] Error processing event:', event?.type, err);
        pushWarning(`Event processing error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [chatStore.turn.streamChatId, pushWarning],
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

      dispatch({ type: 'ADD_USER_MESSAGE', chatId, message: userMessage, rawContent: message });
      dispatch({ type: 'TURN_START', chatId });
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
            lastTurnEventsRef.current.push('error');
            const targetChatId = chatStore.turn.streamChatId ?? activeChatIdRef.current;
            if (!targetChatId) return;
            dispatch({ type: 'STREAM_ERROR', chatId: targetChatId, errorMessage: msg });
          },
        },
      });
      return true;
    },
    [activeChat, chatStore.turn.streamChatId, handleEvent, run, sessionId, status],
  );

  const send = useCallback(() => {
    const sent = sendMessage(input);
    if (sent) setInput('');
  }, [input, sendMessage]);

  const createChat = useCallback(() => {
    if (status !== 'idle') return;
    const nextChat = createEmptyChatSession(chatStore.chatOrder.length + 1);
    dispatch({ type: 'CREATE_CHAT', chat: nextChat });
    setActiveChatId(nextChat.id);
    setInput('');
  }, [chatStore.chatOrder.length, status]);

  const selectChat = useCallback(
    (chatId: string) => {
      if (status !== 'idle') return;
      if (chatId === activeChatId) return;
      dispatch({ type: 'SELECT_CHAT', chatId });
      setActiveChatId(chatId);
      setInput('');
    },
    [activeChatId, status],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      if (status !== 'idle') return;
      const wasStreaming = chatStore.turn.streamChatId === chatId;
      if (wasStreaming) cancel();

      dispatch({ type: 'DELETE_CHAT', chatId, activeChatId: activeChatIdRef.current });

      // Determine next active chat
      const index = chatStore.chatOrder.indexOf(chatId);
      if (index === -1) return;
      if (chatStore.chatOrder.length === 1) {
        // A replacement was created by the reducer; read it after dispatch settles
        setInput('');
      } else if (activeChatIdRef.current === chatId) {
        const nextOrder = chatStore.chatOrder.filter((id) => id !== chatId);
        const nextActiveId = nextOrder[Math.max(0, index - 1)] ?? nextOrder[0]!;
        setActiveChatId(nextActiveId);
        setInput('');
      }
    },
    [cancel, chatStore.chatOrder, chatStore.turn.streamChatId, status],
  );

  const clearActiveChat = useCallback(() => {
    if (!activeChat || status !== 'idle') return;

    const clearBatch: DrawBatch = {
      batch_id: `clear-${createId()}`,
      style_preset: 'clean_pen_sketch',
      elements: [{ id: `clear-${createId()}`, type: 'clear' }],
    };

    dispatch({ type: 'CLEAR_CHAT', chatId: activeChat.id, clearBatch });
  }, [activeChat, status]);

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
    if (activeChat && activeChat.scene.length > AGENT_SCENE_LIMIT) {
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
  }, [activeChat?.scene.length, agentDomainIndex, agentRunning, clearForAgent, isAgentMode, sendMessage, status]);

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
      chatStore.chatOrder.map((id) => {
        const chat = chatStore.chats[id]!;
        return {
          id: chat.id,
          title: chat.title,
          messageCount: chat.messages.length,
        };
      }),
    [chatStore.chatOrder, chatStore.chats],
  );

  const warningsUI = useMemo(
    () =>
      (activeChat?.warnings?.length ?? 0) > 0 ? (
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
    [activeChat?.warnings],
  );

  const statusLabel =
    status === 'idle'
      ? 'Ready'
      : status === 'thinking'
        ? 'Thinking'
        : status === 'streaming'
          ? 'Responding'
          : 'Drawing';

  const statusTone =
    status === 'idle'
      ? 'bg-emerald-500'
      : status === 'thinking'
        ? 'bg-amber-500'
        : status === 'streaming'
          ? 'bg-sky-500'
          : 'bg-indigo-500';
  const agentDomain = AGENT_DOMAINS[agentDomainIndex % AGENT_DOMAINS.length]!;

  if (!activeChat) return null;

  return (
    <main className="relative h-screen w-screen overflow-hidden p-2 text-[var(--color-text-primary)] sm:p-4">
      <div className="app-card glass-panel animate-rise-in relative flex h-full min-h-0 flex-col overflow-hidden border-[var(--color-border)]">
        <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4 sm:px-5">
          <div>
            <h1 className="font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
              AgentsLeague
            </h1>
            <p className="text-[11px] text-[var(--color-text-muted)]">Interleaved conversational whiteboard</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5">
            <span className={`h-2 w-2 rounded-full ${statusTone}`} data-testid="status-dot" />
            <span className="text-[11px] font-medium text-[var(--color-text-secondary)]" data-testid="status-label">{statusLabel}</span>
          </div>
        </header>

        <div
          className="relative flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row"
          style={{ ['--left-width' as string]: `${panelSizes[0]}%` }}
        >
          <section data-testid="whiteboard-canvas" className={isAgentMode ? 'h-full w-full' : 'h-[56%] w-full lg:h-full lg:w-[var(--left-width)]'}>
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
              className="group relative hidden w-2 cursor-col-resize rounded-full bg-transparent lg:block"
              onPointerDown={(e) => {
                const startX = e.clientX;
                const target = e.currentTarget;
                target.setPointerCapture(e.pointerId);

                const onMove = (ev: PointerEvent) => {
                  const dx = ev.clientX - startX;
                  const vw = window.innerWidth;
                  resizeBy((dx / vw) * 100);
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
            <section data-testid="chat-panel" className="h-[44%] min-h-0 w-full lg:h-full lg:flex-1">
              <ChatPanel
                chats={chatMeta}
                activeChatId={activeChat.id}
                messages={activeChat.messages}
                input={input}
                status={status}
                onInput={setInput}
                onSend={send}
                onCancel={() => {
                  cancel();
                  // TURN_DONE resets all turn state to idle
                  const targetChatId = chatStore.turn.streamChatId ?? activeChatIdRef.current;
                  if (targetChatId) dispatch({ type: 'TURN_DONE', chatId: targetChatId });
                }}
                onSelectChat={selectChat}
                onCreateChat={createChat}
                onDeleteChat={deleteChat}
                onDeleteMessage={(messageId) => {
                  dispatch({ type: 'DELETE_MESSAGE', chatId: activeChat.id, messageId });
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
    </main>
  );
}
