'use client';

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useUndoRedo } from '@/hooks/canvas/useUndoRedo';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { useInteractionMode } from '@/hooks/interaction/useInteractionMode';
import { InteractionMode } from '@/types/interaction';

// ── SVG Icons ───────────────────────────────────────────────────────

function TextIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7V4h16v3" />
      <path d="M12 4v16" />
      <path d="M8 20h8" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Tooltip Button ──────────────────────────────────────────────────

interface TooltipButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  variant?: 'default' | 'danger';
  children: ReactNode;
}

function TooltipButton({
  label,
  onClick,
  disabled = false,
  active = false,
  variant = 'default',
  children,
}: TooltipButtonProps) {
  const base =
    'relative flex items-center justify-center rounded-lg min-w-[44px] min-h-[44px] p-2 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-accent))] focus-visible:ring-offset-1';

  let stateClass: string;
  if (disabled) {
    stateClass = 'cursor-not-allowed opacity-50';
  } else if (active) {
    stateClass =
      'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-text-inverse))] hover:scale-105 active:scale-95';
  } else if (variant === 'danger') {
    stateClass =
      'text-[hsl(var(--color-text-secondary))] hover:bg-[hsl(var(--color-error)/0.12)] hover:text-[hsl(var(--color-error))] hover:scale-105 active:scale-95';
  } else {
    stateClass =
      'text-[hsl(var(--color-text-secondary))] hover:bg-[hsl(var(--color-surface-raised))] hover:text-[hsl(var(--color-text-primary))] hover:scale-105 active:scale-95';
  }

  return (
    <div className="group/tip relative">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`${base} ${stateClass}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute -bottom-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[hsl(var(--color-text-primary))] px-2 py-1 text-xs text-[hsl(var(--color-text-inverse))] opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

// ── Separator ───────────────────────────────────────────────────────

function Separator({ vertical = true }: { vertical?: boolean }) {
  return vertical ? (
    <div className="mx-1.5 h-6 w-px bg-[hsl(var(--color-border-subtle))]" role="separator" aria-hidden="true" />
  ) : (
    <div className="my-1 h-px w-full bg-[hsl(var(--color-border-subtle))]" role="separator" aria-hidden="true" />
  );
}

// ── Main Toolbar ────────────────────────────────────────────────────

interface ToolbarProps {
  onSettingsOpen?: () => void;
}

export default function Toolbar({ onSettingsOpen }: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // ── Connected stores & hooks ────────────────────────────────────
  const { canUndo, canRedo, undo, redo, clear } = useUndoRedo();
  const { mode, switchMode } = useInteractionMode();
  const reset = useDrawingSessionStore((s) => s.reset);

  // ── Auto-dismiss clear confirmation after 3 s ───────────────────
  useEffect(() => {
    if (!confirmClear) return;
    confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, [confirmClear]);

  // ── Close menus / dialogs on Escape ─────────────────────────────
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setConfirmClear(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Keyboard navigation (arrow keys within toolbar) ─────────────
  const handleToolbarKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const toolbar = toolbarRef.current;
      if (!toolbar) return;

      const buttons = Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (idx === -1) return;

      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = (idx + 1) % buttons.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = (idx - 1 + buttons.length) % buttons.length;
      } else if (e.key === 'Home') {
        next = 0;
      } else if (e.key === 'End') {
        next = buttons.length - 1;
      }

      if (next >= 0) {
        e.preventDefault();
        buttons[next]?.focus();
      }
    },
    [],
  );

  // ── Handlers ────────────────────────────────────────────────────
  const handleModeToggle = useCallback(() => {
    switchMode(
      mode === InteractionMode.TEXT ? InteractionMode.VOICE : InteractionMode.TEXT,
    );
  }, [mode, switchMode]);

  const handleClearCanvas = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clear();
    reset();
    setConfirmClear(false);
  }, [confirmClear, clear, reset]);

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  const handleSettings = useCallback(() => {
    onSettingsOpen?.();
    setMenuOpen(false);
  }, [onSettingsOpen]);

  // ── Shared button renderer ──────────────────────────────────────
  const renderButtons = (vertical: boolean) => (
    <>
      {/* Mode toggle */}
      <TooltipButton
        label={mode === InteractionMode.TEXT ? 'Switch to Voice' : 'Switch to Text'}
        onClick={handleModeToggle}
        active={mode === InteractionMode.VOICE}
      >
        {mode === InteractionMode.TEXT ? <MicIcon /> : <TextIcon />}
      </TooltipButton>

      <Separator vertical={!vertical} />

      {/* Undo / Redo */}
      <TooltipButton label="Undo" onClick={handleUndo} disabled={!canUndo}>
        <UndoIcon />
      </TooltipButton>
      <TooltipButton label="Redo" onClick={handleRedo} disabled={!canRedo}>
        <RedoIcon />
      </TooltipButton>

      <Separator vertical={!vertical} />

      {/* Clear canvas */}
      {confirmClear ? (
        <button
          onClick={handleClearCanvas}
          aria-label="Confirm clear canvas"
          className="flex items-center justify-center rounded-lg min-w-[44px] min-h-[44px] px-3 text-xs font-semibold bg-[hsl(var(--color-error))] text-white transition-all duration-200 hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-error))]"
        >
          Confirm?
        </button>
      ) : (
        <TooltipButton label="Clear Canvas" onClick={handleClearCanvas} variant="danger">
          <TrashIcon />
        </TooltipButton>
      )}

      <Separator vertical={!vertical} />

      {/* Settings */}
      <TooltipButton label="Settings" onClick={handleSettings}>
        <SettingsIcon />
      </TooltipButton>
    </>
  );

  return (
    <>
      {/* ── Desktop toolbar (md+) ──────────────────────────────── */}
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Canvas controls"
        aria-orientation="horizontal"
        onKeyDown={handleToolbarKeyDown}
        className="fixed right-4 top-4 z-50 hidden items-center gap-1 rounded-xl border border-[hsl(var(--toolbar-border))] bg-[hsl(var(--toolbar-bg)/0.85)] px-2 py-1.5 shadow-lg backdrop-blur-xl md:flex"
      >
        {renderButtons(false)}
      </div>

      {/* ── Mobile hamburger (< md) ────────────────────────────── */}
      <div className="fixed right-4 top-4 z-50 md:hidden">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="flex items-center justify-center rounded-xl border border-[hsl(var(--toolbar-border))] bg-[hsl(var(--toolbar-bg)/0.85)] p-2.5 text-[hsl(var(--color-text-primary))] shadow-lg backdrop-blur-xl transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        {menuOpen && (
          <div
            role="toolbar"
            aria-label="Canvas controls"
            aria-orientation="vertical"
            onKeyDown={handleToolbarKeyDown}
            className="absolute right-0 top-full mt-2 flex flex-col items-stretch gap-1 rounded-xl border border-[hsl(var(--toolbar-border))] bg-[hsl(var(--toolbar-bg)/0.95)] p-2 shadow-xl backdrop-blur-xl"
            style={{ animation: 'toolbar-fade-in 150ms ease-out' }}
          >
            {renderButtons(true)}
          </div>
        )}
      </div>

      {/* Keyframes for mobile menu entrance */}
      <style>{`
        @keyframes toolbar-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
