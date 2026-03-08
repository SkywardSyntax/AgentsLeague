'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { WhiteboardCanvas } from '@/components/whiteboard/WhiteboardCanvas';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useChatSessions, createId, rebuildSceneFromBatches } from '@/hooks/useChatSessions';
import { useDrawingEngine } from '@/hooks/useDrawingEngine';
import { useStreamOrchestrator } from '@/hooks/useStreamOrchestrator';
import { AGENT_DOMAINS, QueryEngine } from '@/lib/agent/queryEngine';
import { type AppMode, getClientAppMode, getInitialAppMode } from '@/lib/mode';
import { decompressShareData } from '@/lib/share-url';
import type { DrawBatch } from '@/types/agent';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { WarningOverlay } from '@/components/app/WarningOverlay';
import { useTheme } from '@/components/app/ThemeProvider';
import { DrawingStatusPill } from '@/components/whiteboard/DrawingStatusPill';
import { DrawingStatistics } from '@/components/whiteboard/DrawingStatistics';
import { ElementInspector } from '@/components/whiteboard/ElementInspector';
import { KeyboardShortcutsModal } from '@/components/whiteboard/KeyboardShortcutsModal';
import { PayloadPlayground } from '@/components/whiteboard/PayloadPlayground';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';

/* ── Agent API types ─────────────────────────────────────────────────────── */

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

/* ── SVG Icons ───────────────────────────────────────────────────────────── */

function DiamondIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2L18 10L10 18L2 10Z" />
      <path d="M10 6L14 10L10 14L6 10Z" opacity="0.4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M13.5 8.5A5.5 5.5 0 117.5 2.5a4 4 0 006 6z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 3L5 8L10 13" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 3L11 8L6 13" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 3h12v8H6l-4 3V3z" />
    </svg>
  );
}

function CanvasIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M2 6h12M6 2v12" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 4L1 8L5 12M11 4L15 8L11 12" />
    </svg>
  );
}

/* ── Agent Sidebar ───────────────────────────────────────────────────────── */

function AgentSidebar({
  agentDomain,
  statusLabel,
  agentLastQuery,
  agentRunning,
  onToggleAgent,
  onClear,
}: {
  agentDomain: string;
  statusLabel: string;
  agentLastQuery: string;
  agentRunning: boolean;
  onToggleAgent: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col gap-3 rounded-lg bg-[var(--color-surface)] p-4 md:w-[280px]">
      <h3 className="text-sm font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
        Agent Mode
      </h3>
      <div className="space-y-2 text-xs text-[var(--color-text-secondary)]">
        <div className="flex items-center justify-between">
          <span>Status</span>
          <Badge variant={agentRunning ? 'mint' : 'default'} dot>{statusLabel}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span>Domain</span>
          <Badge variant="accent">{agentDomain}</Badge>
        </div>
        {agentLastQuery && (
          <p className="mt-2 rounded-md bg-[var(--color-surface-raised)] p-2 text-[11px] text-[var(--color-text-muted)]">
            {agentLastQuery}
          </p>
        )}
      </div>
      <div className="mt-auto flex gap-2">
        <button
          onClick={onToggleAgent}
          className={`cursor-pointer flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            agentRunning
              ? 'bg-[var(--color-danger)] text-white'
              : 'bg-[var(--color-mint)] text-[#09090F]'
          }`}
        >
          {agentRunning ? 'Stop' : 'Start'}
        </button>
        <button
          onClick={onClear}
          className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-raised)]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/* ── Mobile Bottom Nav ───────────────────────────────────────────────────── */

type MobilePanel = 'chat' | 'whiteboard' | 'playground';

function MobileBottomNav({
  active,
  onSwitch,
}: {
  active: MobilePanel;
  onSwitch: (panel: MobilePanel) => void;
}) {
  const tabs: { id: MobilePanel; label: string; icon: React.ReactNode }[] = [
    { id: 'chat', label: 'Chat', icon: <ChatIcon /> },
    { id: 'whiteboard', label: 'Canvas', icon: <CanvasIcon /> },
    { id: 'playground', label: 'API', icon: <CodeIcon /> },
  ];

  return (
    <nav className="glass-panel fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[var(--color-border)] py-1.5 md:hidden">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSwitch(tab.id)}
          className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 text-[10px] font-medium transition-colors ${
            active === tab.id
              ? 'text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

/* ── AppShell ────────────────────────────────────────────────────────────── */

export function AppShell() {
  // ─── Chat sessions ──
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
    pushWarning,
    dismissWarnings,
    dismissOneWarning,
    chatMeta,
  } = useChatSessions();

  // ─── Drawing engine ──
  const drawing = useDrawingEngine({
    activeChatId,
    activeChat,
    setChatSessions,
    activeChatIdRef,
    pushWarning,
  });

  // ─── Stream orchestrator ──
  const stream = useStreamOrchestrator({
    setChatSessions,
    activeChat,
    activeChatIdRef,
    sessionId,
    drawing,
    pushWarning,
  });
  const { status, cancel, resetStreamState, sendMessage } = stream;

  // ─── Theme ──
  const { theme, toggleTheme } = useTheme();

  // ─── App mode & local UI state ──
  const [appMode] = useState<AppMode>(() => {
    if (typeof window === 'undefined') return getInitialAppMode();
    return getClientAppMode(window.location.search);
  });
  const isAgentMode = appMode === 'agent';
  const [input, setInput] = useState('');
  const [agentRunning, setAgentRunning] = useState(() => appMode === 'agent');
  const [agentLastQuery, setAgentLastQuery] = useState('');
  const [agentDomainIndex, setAgentDomainIndex] = useState(0);
  const [mobileActivePanel, setMobileActivePanel] = useState<MobilePanel>('whiteboard');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const exportToggleRef = useRef<(() => void) | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const agentQueryEngineRef = useRef(new QueryEngine());
  const agentDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autosaveFlash, setAutosaveFlash] = useState(false);

  // ─── Scene restore / share banners ──
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [showSharedToast, setShowSharedToast] = useState(false);
  const sceneRestoredRef = useRef(false);

  useEffect(() => {
    if (didRestoreSession && drawing.savedSceneExists && !sceneRestoredRef.current) {
      setShowRestoreBanner(true);
    }
  }, [didRestoreSession, drawing.savedSceneExists]);

  // Load scene from ?scene= URL param on mount
  useEffect(() => {
    if (!didRestoreSession) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const sceneParam = params.get('scene');
    if (!sceneParam) return;

    (async () => {
      try {
        const json = await decompressShareData(sceneParam);
        const batches = JSON.parse(json) as DrawBatch[];
        if (!Array.isArray(batches) || batches.length === 0) return;

        setShowSharedToast(true);
        setTimeout(() => setShowSharedToast(false), 3000);

        setChatSessions((prev) =>
          prev.map((chat) => {
            if (chat.id !== activeChat.id) return chat;
            let scene = [...chat.scene];
            const allBatches = [...chat.batches];
            for (const batch of batches) {
              if (batch.elements.some((el) => el.type === 'clear')) {
                scene = [];
              }
              for (const el of batch.elements) {
                if (el.type !== 'clear') scene.push(el);
              }
              allBatches.push(batch);
            }
            return { ...chat, updatedAt: Date.now(), scene, batches: allBatches };
          }),
        );

        const url = new URL(window.location.href);
        url.searchParams.delete('scene');
        window.history.replaceState({}, '', url.toString());
      } catch {
        // invalid data — ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [didRestoreSession]);

  // ─── Auto-save flash ──
  useEffect(() => {
    if (drawing.savedSceneExists) {
      setAutosaveFlash(true);
      const t = setTimeout(() => setAutosaveFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [drawing.savedSceneExists]);

  // ─── Chat CRUD wrappers ──

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
        streamChatId: stream.streamChatIdRef.current,
      });
      setInput('');
    },
    [cancel, resetStreamState, selectChatBase, stream.streamChatIdRef],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      if (status !== 'idle') return;
      deleteChatBase(chatId, {
        cancel,
        resetStreamState: () => {
          stream.setStatus('idle');
          resetStreamState();
        },
        streamChatId: stream.streamChatIdRef.current,
      });
      setInput('');
    },
    [cancel, deleteChatBase, resetStreamState, status, stream],
  );

  const clearActiveChat = useCallback(() => {
    if (!activeChat || status !== 'idle') return;
    drawing.pushHistoryState(activeChat.batches);
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
    drawing.clearSavedScene();
  }, [activeChat, drawing, resetStreamState, setChatSessions, status]);

  const clearForAgent = useCallback(() => {
    clearActiveChat();
    setAgentLastQuery('');
    stream.lastTurnEventsRef.current = [];
  }, [clearActiveChat, stream.lastTurnEventsRef]);

  // ─── Agent mode ──
  const AGENT_SCENE_LIMIT = 60;
  const AGENT_INTER_TURN_DELAY_MS = 2000;

  useEffect(() => {
    if (!isAgentMode || !agentRunning) return;
    if (status !== 'idle') return;

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
      submitQuery: async (text: string) => { sendMessage(text); },
      getStatus: () => status,
      getMessages: () => activeChat.messages.map((m) => ({ role: m.role, content: m.content })),
      getElementCount: () => activeChat.scene.length,
      clearActiveChat: clearForAgent,
      getLastTurnEvents: () => [...stream.lastTurnEventsRef.current],
      getLastDomain: () => {
        const idx = Math.max(0, agentDomainIndex - 1);
        return AGENT_DOMAINS[idx % AGENT_DOMAINS.length]!;
      },
    };
    return () => { delete window.__agentAPI; };
  }, [activeChat, agentDomainIndex, clearForAgent, isAgentMode, sendMessage, status, stream.lastTurnEventsRef]);

  // ─── Panel resize ──
  const resizeBy = useCallback((delta: number) => {
    setPanelSizes(([left]) => {
      const nextLeft = Math.min(75, Math.max(42, left + delta));
      return [nextLeft, 100 - nextLeft];
    });
  }, [setPanelSizes]);

  // ─── Derived values ──
  const statusLabel =
    status === 'idle' ? 'Ready' : status === 'thinking' ? 'Thinking' : status === 'streaming' ? 'Responding' : 'Drawing';
  const agentDomain = AGENT_DOMAINS[agentDomainIndex % AGENT_DOMAINS.length]!;
  const streamPhase = drawing.computeStreamPhase(status);
  const drawingProgress = drawing.computeDrawingProgress(status);
  const handleUndo = useCallback(() => drawing.handleUndo(status), [drawing, status]);
  const handleRedo = useCallback(() => drawing.handleRedo(status), [drawing, status]);

  // ─── Keyboard shortcuts ──
  useKeyboardShortcuts(
    useMemo(
      () => ({
        focusInput: () => chatInputRef.current?.focus(),
        newChat: () => createChat(),
        cancelStream: () => {
          if (status !== 'idle') {
            cancel();
            resetStreamState();
            stream.setStatus('idle');
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
        toggleInjector: () => setRightPanelOpen((p) => !p),
        undo: handleUndo,
        redo: handleRedo,
        openExport: () => exportToggleRef.current?.(),
        saveSnapshot: () => {
          if (activeChat && activeChat.batches.length > 0) {
            drawing.saveSnapshot(activeChat.batches);
          }
        },
        copyShareUrl: async () => {
          if (!activeChat || activeChat.batches.length === 0) return;
          try {
            const { compressShareData } = await import('@/lib/share-url');
            const json = JSON.stringify(activeChat.batches);
            const compressed = await compressShareData(json);
            const url = `${window.location.origin}${window.location.pathname}?scene=${compressed}`;
            await navigator.clipboard.writeText(url);
          } catch { /* clipboard may not be available */ }
        },
        showShortcuts: () => setShortcutsModalOpen((v) => !v),
        selectAll: () => {
          const el = document.getElementById('panel-whiteboard');
          el?.focus();
        },
      }),
      [activeChatId, activeChat, cancel, chatSessions, createChat, drawing, handleRedo, handleUndo, resetStreamState, selectChat, status, stream],
    ),
  );

  // ─── Loading state ──
  if (!didRestoreSession) {
    return (
      <ErrorBoundary>
        <main className="relative flex h-screen w-screen items-center justify-center bg-[var(--color-bg)]" style={{ height: '100dvh' }}>
          <div className="flex flex-col items-center gap-3">
            <DiamondIcon className="h-8 w-8 text-[var(--color-accent)] animate-spinner" />
            <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
          </div>
        </main>
      </ErrorBoundary>
    );
  }

  if (!activeChat) return null;

  return (
    <ErrorBoundary>
      <main
        id="main-content"
        className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text-primary)]"
        style={{ height: '100dvh' }}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-[var(--color-surface)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--color-text-primary)] focus:shadow-lg">
          Skip to main content
        </a>

        {/* ── Header ── */}
        <header className="glass-header animate-header-in relative z-30 flex h-[var(--header-height)] flex-shrink-0 items-center justify-between px-4">
          {/* Left: Logo + nav */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <DiamondIcon className="h-5 w-5 text-[var(--color-accent)]" />
              <span className="text-sm font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                AgentsLeague
              </span>
            </div>

            {/* Status badge */}
            {status !== 'idle' && (
              <Badge variant={status === 'drawing' ? 'mint' : 'accent'} dot>
                {statusLabel}
              </Badge>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-1">
            {!isAgentMode && (
              <>
                <IconButton
                  variant="ghost"
                  tooltip="Undo (⌘Z)"
                  icon={
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M3 8h7a3 3 0 010 6H8" />
                      <path d="M6 5L3 8L6 11" />
                    </svg>
                  }
                  onClick={handleUndo}
                  disabled={!drawing.canUndo}
                />
                <IconButton
                  variant="ghost"
                  tooltip="Redo (⌘⇧Z)"
                  icon={
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M13 8H6a3 3 0 000 6h2" />
                      <path d="M10 5L13 8L10 11" />
                    </svg>
                  }
                  onClick={handleRedo}
                  disabled={!drawing.canRedo}
                />
                <div className="mx-1 h-4 w-px bg-[var(--color-border-subtle)]" />
              </>
            )}
            <IconButton
              variant="ghost"
              tooltip={inspectorOpen ? 'Close Inspector' : 'Inspector'}
              icon={
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="2" y="2" width="12" height="12" rx="2" />
                  <path d="M6 2v12" />
                </svg>
              }
              onClick={() => setInspectorOpen((p) => !p)}
            />
            <IconButton
              variant="ghost"
              tooltip={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              icon={theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              onClick={toggleTheme}
            />
            <IconButton
              variant="ghost"
              tooltip="Shortcuts (?)"
              icon={<SettingsIcon />}
              onClick={() => setShortcutsModalOpen(true)}
            />
          </div>
        </header>

        {/* ── Restore banner ── */}
        {showRestoreBanner && (
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-accent-faint)] px-4 py-2 text-xs text-[var(--color-text-secondary)]">
            <span>You have a saved scene.</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="cursor-pointer rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                onClick={() => {
                  const batches = drawing.restoreScene();
                  if (batches && activeChat) {
                    const scene = rebuildSceneFromBatches(batches);
                    setChatSessions((prev) =>
                      prev.map((chat) =>
                        chat.id === activeChat.id
                          ? { ...chat, updatedAt: Date.now(), scene, batches }
                          : chat,
                      ),
                    );
                  }
                  setShowRestoreBanner(false);
                  sceneRestoredRef.current = true;
                }}
              >
                Restore
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
                onClick={() => {
                  setShowRestoreBanner(false);
                  sceneRestoredRef.current = true;
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── Shared toast ── */}
        {showSharedToast && (
          <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border border-[var(--color-accent-soft)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium text-[var(--color-accent)] shadow-lg">
            Loading shared scene…
          </div>
        )}

        {/* ── 3-column layout ── */}
        <div className="relative flex min-h-0 flex-1">

          {/* ── Left Panel: Chat ── */}
          {!isAgentMode && (
            <section
              id="panel-chat"
              data-testid="chat-panel"
              className={`animate-panel-left hidden flex-shrink-0 border-r border-[var(--color-border-subtle)] md:flex ${
                leftPanelOpen ? 'w-[320px]' : 'w-0'
              } panel-collapsible flex-col`}
            >
              {leftPanelOpen && (
                <div className="panel-content-fade flex h-full flex-col">
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
                      stream.setStatus('idle');
                    }}
                    onSelectChat={selectChat}
                    onCreateChat={createChat}
                    onDeleteChat={deleteChat}
                    onDeleteMessage={(messageId) => {
                      if (stream.currentAssistantMessageId.current === messageId) {
                        stream.currentAssistantMessageId.current = null;
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
                </div>
              )}
            </section>
          )}

          {/* ── Left panel toggle (desktop) ── */}
          {!isAgentMode && (
            <button
              onClick={() => setLeftPanelOpen((p) => !p)}
              className="hidden md:flex absolute left-[318px] top-1/2 z-20 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-md border border-l-0 border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-secondary)]"
              style={{ left: leftPanelOpen ? '318px' : '0px' }}
              title={leftPanelOpen ? 'Collapse chat' : 'Expand chat'}
            >
              {leftPanelOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            </button>
          )}

          {/* ── Center: Canvas ── */}
          <section
            id="panel-whiteboard"
            data-testid="whiteboard-canvas"
            tabIndex={-1}
            className={`animate-canvas-in relative min-h-0 flex-1 ${
              mobileActivePanel === 'whiteboard' ? '' : 'hidden md:block'
            }`}
          >
            <WhiteboardCanvas
              key={activeChat.id}
              batches={activeChat.batches}
              onWarning={(warning) => pushWarning(warning, activeChat.id)}
              exportToggleRef={exportToggleRef}
              autoSaved={drawing.savedSceneExists}
              elementCount={activeChat.scene.length}
            />
            <DrawingStatusPill state={drawing.drawingPillState} />
            <DrawingStatistics
              scene={activeChat.scene}
              batches={activeChat.batches}
              lastDrawSource={drawing.lastDrawSource}
              onCopyScene={drawing.handleCopySceneJson}
              snapshots={drawing.snapshots}
              onSaveSnapshot={() => drawing.saveSnapshot(activeChat.batches)}
              onRestoreSnapshot={(id) => {
                const batches = drawing.restoreSnapshot(id);
                if (batches && activeChat) {
                  drawing.pushHistoryState(activeChat.batches);
                  const scene = rebuildSceneFromBatches(batches);
                  setChatSessions((prev) =>
                    prev.map((chat) =>
                      chat.id === activeChat.id
                        ? { ...chat, updatedAt: Date.now(), scene, batches }
                        : chat,
                    ),
                  );
                }
              }}
              onDeleteSnapshot={drawing.deleteSnapshot}
            />
            <ElementInspector
              scene={activeChat.scene}
              batches={activeChat.batches}
              open={inspectorOpen}
              onClose={() => setInspectorOpen(false)}
            />
          </section>

          {/* ── Right Panel: Payload Playground ── */}
          {!isAgentMode && (
            <section
              className={`animate-panel-right hidden flex-shrink-0 border-l border-[var(--color-border-subtle)] md:flex ${
                rightPanelOpen ? 'w-[380px]' : 'w-0'
              } panel-collapsible flex-col`}
            >
              {rightPanelOpen && (
                <div className="panel-content-fade h-full">
                  <PayloadPlayground
                    onInject={drawing.handleDrawInject}
                    sessionId={activeChat.id}
                  />
                </div>
              )}
            </section>
          )}

          {/* ── Right panel toggle (desktop) ── */}
          {!isAgentMode && (
            <button
              onClick={() => setRightPanelOpen((p) => !p)}
              className="hidden md:flex absolute top-1/2 z-20 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-md border border-r-0 border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-secondary)]"
              style={{ right: rightPanelOpen ? '378px' : '0px' }}
              title={rightPanelOpen ? 'Collapse playground' : 'Expand playground'}
            >
              {rightPanelOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          )}

          {/* ── Agent sidebar ── */}
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

          {/* ── Warnings overlay ── */}
          <WarningOverlay
            notifications={activeChat.warnings}
            onDismissOne={dismissOneWarning}
            onDismissAll={dismissWarnings}
          />
        </div>

        {/* ── Mobile panels ── */}
        {!isAgentMode && mobileActivePanel === 'chat' && (
          <div className="fixed inset-0 z-30 bg-[var(--color-bg)] pt-[var(--header-height)] pb-14 md:hidden">
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
              onCancel={() => { cancel(); resetStreamState(); stream.setStatus('idle'); }}
              onSelectChat={selectChat}
              onCreateChat={createChat}
              onDeleteChat={deleteChat}
              onDeleteMessage={(messageId) => {
                if (stream.currentAssistantMessageId.current === messageId) {
                  stream.currentAssistantMessageId.current = null;
                }
                setChatSessions((prev) =>
                  prev.map((chat) =>
                    chat.id === activeChat.id
                      ? { ...chat, updatedAt: Date.now(), messages: chat.messages.filter((m) => m.id !== messageId) }
                      : chat,
                  ),
                );
              }}
              onClearChat={clearActiveChat}
              onRetry={(lastUserMessage) => { sendMessage(lastUserMessage); }}
              disabled={status !== 'idle'}
            />
          </div>
        )}

        {!isAgentMode && mobileActivePanel === 'playground' && (
          <div className="fixed inset-0 z-30 bg-[var(--color-bg)] pt-[var(--header-height)] pb-14 md:hidden">
            <PayloadPlayground
              onInject={drawing.handleDrawInject}
              sessionId={activeChat.id}
            />
          </div>
        )}

        {/* ── Status Bar ── */}
        <footer className="flex h-6 flex-shrink-0 items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 text-[10px] tabular-nums text-[var(--color-text-muted)]">
          <div className="flex items-center gap-3">
            <span>{activeChat.scene.length} element{activeChat.scene.length !== 1 ? 's' : ''}</span>
            <span className="opacity-30">·</span>
            <span>{activeChat.batches.length} batch{activeChat.batches.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            {drawing.savedSceneExists && (
              <span className={`flex items-center gap-1 ${autosaveFlash ? 'animate-mint-pulse' : ''}`}>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-mint)]" />
                Autosaved
              </span>
            )}
            <span>{status !== 'idle' ? statusLabel : 'Ready'}</span>
          </div>
        </footer>

        {/* ── Mobile bottom nav ── */}
        {!isAgentMode && (
          <MobileBottomNav active={mobileActivePanel} onSwitch={setMobileActivePanel} />
        )}

        <KeyboardShortcutsModal open={shortcutsModalOpen} onClose={() => setShortcutsModalOpen(false)} />
      </main>
    </ErrorBoundary>
  );
}
