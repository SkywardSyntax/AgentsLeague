'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { WhiteboardCanvas } from '@/components/whiteboard';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { LazyToolbar } from '@/components/lazy';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useSessionSync } from '@/hooks/useSessionSync';
import { useTheme } from '@/hooks/useTheme';
import { useWhiteboard } from '@/stores/whiteboard-store';

// ── Onboarding tip shown once per device ────────────────────────────

const ONBOARDING_KEY = 'agents-league:onboarded';

function OnboardingTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 z-tooltip -translate-x-1/2 animate-[fadeSlideUp_0.3s_ease-out] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 shadow-xl max-w-xs sm:max-w-sm text-center"
    >
      <p className="text-sm text-[var(--color-text-primary)] font-medium mb-1">
        Welcome to AI Whiteboard ✦
      </p>
      <p className="text-xs text-[var(--color-text-secondary)] mb-3">
        Draw on the canvas or chat with AI to generate visuals. Press{' '}
        <kbd className="rounded border border-[var(--color-border)] px-1 py-0.5 text-[10px] font-mono">?</kbd>{' '}
        for shortcuts.
      </p>
      <button
        onClick={onDismiss}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
      >
        Got it
      </button>
    </div>
  );
}

// ── Toolbar loading fallback ────────────────────────────────────────

function ToolbarFallback() {
  return (
    <div className="fixed right-4 top-4 z-toolbar h-10 w-48 animate-pulse rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hidden md:block" />
  );
}

// ── Resize handle for desktop panels ────────────────────────────────

function ResizeHandle({ onResize }: { onResize: (deltaX: number) => void }) {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        onResize(ev.clientX - startX);
      };
      const onUp = () => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
    },
    [onResize],
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      className="hidden md:flex w-1.5 cursor-col-resize items-center justify-center hover:bg-[var(--color-accent)]/20 active:bg-[var(--color-accent)]/30 transition-colors group"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
      tabIndex={0}
    >
      <div className="h-8 w-0.5 rounded-full bg-[var(--color-border)] group-hover:bg-[var(--color-accent)] transition-colors" />
    </div>
  );
}

// ── Main page content (mounted inside providers) ────────────────────

function HomeContent() {
  const { toggleTheme } = useTheme();
  const { selectedIds, setSelectedIds, elements, setElements } = useWhiteboard();

  // Session sync (persists & restores state across reloads/tabs)
  useSessionSync();

  // Panel split ratio (percentage for whiteboard)
  const [splitPct, setSplitPct] = useState(60);

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync initialization from localStorage on mount
      setShowOnboarding(true);
    }
  }, []);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem(ONBOARDING_KEY, '1');
  }, []);

  // Chat panel collapsed state (mobile)
  const [chatCollapsed, setChatCollapsed] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSelectAll: useCallback(() => {
      setSelectedIds(new Set(elements.keys()));
    }, [elements, setSelectedIds]),
    onDelete: useCallback(() => {
      if (selectedIds.size === 0) return;
      const next = new Map(elements);
      for (const id of selectedIds) next.delete(id);
      setElements(next);
      setSelectedIds(new Set());
    }, [selectedIds, elements, setElements, setSelectedIds]),
    onDeselectAll: useCallback(() => {
      setSelectedIds(new Set());
    }, [setSelectedIds]),
    onToggleDarkMode: toggleTheme,
  });

  // Resize handler
  const handleResize = useCallback(
    (deltaX: number) => {
      const vw = window.innerWidth;
      const newPct = Math.min(80, Math.max(30, splitPct + (deltaX / vw) * 100));
      setSplitPct(newPct);
    },
    [splitPct],
  );

  return (
    <main
      id="main-content"
      className="relative flex h-full w-full flex-col md:flex-row"
    >
      {/* ── Whiteboard panel ──────────────────────────────── */}
      <section
        className={`relative w-full md:h-full ${chatCollapsed ? 'h-full' : 'h-[55vh]'}`}
        style={{ flex: `0 0 ${splitPct}%` }}
        aria-label="Whiteboard canvas"
      >
        <ErrorBoundary
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-canvas text-content-secondary">
              <p>Canvas failed to load. Please refresh.</p>
            </div>
          }
        >
          <WhiteboardCanvas />
        </ErrorBoundary>
      </section>

      {/* ── Resize handle (desktop only) ─────────────────── */}
      <ResizeHandle onResize={handleResize} />

      {/* ── Chat panel ───────────────────────────────────── */}
      <section
        className={`w-full md:h-full transition-[height] duration-200 ease-out ${
          chatCollapsed ? 'h-0 overflow-hidden md:h-full' : 'h-[45vh]'
        }`}
        style={{
          flex: '1 1 0%',
          minWidth: 0,
        }}
        aria-label="Chat panel"
      >
        <ErrorBoundary
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
              <p>Chat failed to load. Please refresh.</p>
            </div>
          }
        >
          <ChatPanel />
        </ErrorBoundary>
      </section>

      {/* ── Mobile chat toggle ───────────────────────────── */}
      <button
        onClick={() => setChatCollapsed((v) => !v)}
        className="fixed bottom-4 left-4 z-toolbar flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg md:hidden hover:opacity-90 active:scale-95 transition-all"
        aria-label={chatCollapsed ? 'Show chat' : 'Hide chat'}
      >
        {chatCollapsed ? '💬' : '✕'}
      </button>

      {/* ── Floating toolbar ─────────────────────────────── */}
      <Suspense fallback={<ToolbarFallback />}>
        <LazyToolbar />
      </Suspense>

      {/* ── Toast notifications ──────────────────────────── */}
      <ToastContainer />

      {/* ── Onboarding tip ───────────────────────────────── */}
      {showOnboarding && <OnboardingTip onDismiss={dismissOnboarding} />}

      {/* Keyframe for onboarding animation */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </main>
  );
}

// ── Exported page (wraps with error boundary) ───────────────────────

export default function Home() {
  return (
    <ErrorBoundary>
      <HomeContent />
    </ErrorBoundary>
  );
}
