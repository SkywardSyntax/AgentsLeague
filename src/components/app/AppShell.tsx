'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ChatPanel, type ChatThreadMeta } from '@/components/chat/ChatPanel';
import { WhiteboardCanvas } from '@/components/whiteboard/WhiteboardCanvas';
import { useAgentStream } from '@/hooks/useAgentStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useSessionManager, type ChatSessionState } from '@/hooks/useSessionManager';
import { AGENT_DOMAINS, QueryEngine } from '@/lib/agent/queryEngine';
import { sanitizeUserMessage } from '@/lib/client/message-validation';
import { loadSession, saveSession } from '@/lib/client/persistence';
import { type AppMode, getClientAppMode, getInitialAppMode } from '@/lib/mode';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '@/lib/whiteboard/context';
import type { DrawBatch } from '@/types/agent';
import {
  type ChatStore,
  buildRestoreBatch,
  chatSessionReducer,
  createEmptyChatSession,
  createInitialTurn,
  createMessage,
  withoutStreamOverlay,
} from '@/lib/state/chatSessionReducer';
import type { ValidatedAgentSSEEvent } from '@/lib/schema';

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

  const [appMode, setAppMode] = useState<AppMode>(() => getInitialAppMode());
  const isAgentMode = appMode === 'agent';
  const [input, setInput] = useState('');
  type ChatStore,
  buildRestoreBatch,
  chatSessionReducer,
  createEmptyChatSession,
  createInitialTurn,
  createMessage,
  withoutStreamOverlay,
} from '@/lib/state/chatSessionReducer';
import type { ValidatedAgentSSEEvent } from '@/lib/schema';
import {
  removeStreamOverlayFromBatches,
  removeStreamOverlayFromScene,
} from '@/lib/whiteboard/stream-overlay';
import type {
  ChatMessage,
  DrawElement,
  SemanticBatch,
  WhiteboardLayoutDiagnostics,
} from '@/types/agent';
import { fromLegacyDrawBatchToSemanticStub } from '@/lib/whiteboard/planner';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { AppHeader } from '@/components/app/AppHeader';
import { AgentSidebar } from '@/components/app/AgentSidebar';
import { WarningOverlay } from '@/components/app/WarningOverlay';
import { MobilePanelSwitcher } from '@/components/app/MobilePanelSwitcher';

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
        activeChatId: activeChat?.id ?? chatStore.chatOrder[0]!, // safe: guarded by length check above
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
    (event: ValidatedAgentSSEEvent) => {
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
  const [agentRunning, setAgentRunning] = useState(isAgentMode);
  const [agentLastQuery, setAgentLastQuery] = useState('');
  const [agentDomainIndex, setAgentDomainIndex] = useState(0);
  const [mobileActivePanel, setMobileActivePanel] = useState<'whiteboard' | 'chat'>('whiteboard');
  const [seedChat] = useState(() => createEmptyChatSession(1));

  const [chatStore, dispatch] = useReducer(chatSessionReducer, undefined, (): ChatStore => ({
    chatOrder: [seedChat.id],
    chats: { [seedChat.id]: seedChat },
    turn: createInitialTurn(),
  }));

  const status = chatStore.turn.status;
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const agentQueryEngineRef = useRef(new QueryEngine());
  const agentDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTurnEventsRef = useRef<string[]>([]);
  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { run, cancel } = useAgentStream();

  const resetStreamState = useCallback(() => {
    // Stream state is managed by the reducer; this is a no-op compatibility shim
  }, []);
  );

  const sendMessage = useCallback(
    (rawInput: string): boolean => {
      if (!activeChat) return false;
      const message = sanitizeUserMessage(rawInput);
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
      lastTurnEventsRef.current = [];
      dispatch({ type: 'SELECT_CHAT', chatId });
      setActiveChatId(chatId);
      setInput('');
    },
    [cancel, resetStreamState, selectChatBase],
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

    resetStreamState();

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
    [activeChat?.id, activeChat?.warnings],
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

  const dismissWarnings = useCallback(() => {
    if (!activeChat) return;
    setChatSessions((prev) =>
      prev.map((chat) =>
        chat.id === activeChat.id ? { ...chat, warnings: [] } : chat,
      ),
    );
  }, [activeChat, setChatSessions]);

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
        <AppHeader status={status} />

        <div
          className="relative flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row"
          style={{ ['--left-width' as string]: `${panelSizes[0]}%` }}
        >
          <section
            id="panel-whiteboard"
            data-testid="whiteboard-canvas"
            tabIndex={-1}
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
              id="panel-chat"
              data-testid="chat-panel"
              tabIndex={-1}
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
            <AgentSidebar
              agentDomain={agentDomain}
              statusLabel={statusLabel}
              agentLastQuery={agentLastQuery}
              agentRunning={agentRunning}
              onToggleAgent={() => setAgentRunning((prev) => !prev)}
              onClear={clearForAgent}
            />
          )}

          <WarningOverlay warnings={activeChat.warnings} onDismiss={dismissWarnings} />
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
