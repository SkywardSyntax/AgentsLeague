'use client';

import { memo, useCallback, useEffect, useRef } from 'react';

interface ShortcutEntry {
  keys: string;
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: 'Canvas',
    shortcuts: [
      { keys: '⌘/Ctrl + Z', description: 'Undo' },
      { keys: '⌘/Ctrl + Shift + Z', description: 'Redo' },
      { keys: '⌘/Ctrl + A', description: 'Select all' },
      { keys: '⌘/Ctrl + 0', description: 'Fit to content' },
      { keys: '⌘/Ctrl + +/−', description: 'Zoom in / out' },
      { keys: 'Scroll wheel', description: 'Zoom at cursor' },
      { keys: 'Pinch', description: 'Zoom (touch)' },
      { keys: 'Drag', description: 'Pan canvas' },
      { keys: '⌘/Ctrl + ⌫', description: 'Clear canvas' },
    ],
  },
  {
    title: 'Panels & Tools',
    shortcuts: [
      { keys: '⌘/Ctrl + E', description: 'Open export dialog' },
      { keys: '⌘/Ctrl + I', description: 'Toggle injector panel' },
      { keys: '⌘/Ctrl + S', description: 'Save snapshot' },
      { keys: '⌘/Ctrl + Shift + C', description: 'Copy share URL' },
      { keys: '⌘/Ctrl + Shift + D', description: 'Toggle debug overlay' },
      { keys: '⌘/Ctrl + Shift + Q', description: 'Toggle quality panel' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: 'Ctrl + Shift + K', description: 'Focus chat input' },
      { keys: 'Ctrl + Shift + N', description: 'New chat' },
      { keys: '⌘/Ctrl + [', description: 'Previous chat' },
      { keys: '⌘/Ctrl + ]', description: 'Next chat' },
      { keys: 'Ctrl + Shift + M', description: 'Toggle mobile panel' },
    ],
  },
  {
    title: 'Injector',
    shortcuts: [
      { keys: 'Ctrl + Enter', description: 'Validate + inject' },
      { keys: 'Ctrl + Shift + F', description: 'Format JSON' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: 'Esc', description: 'Close panel / cancel stream' },
      { keys: '?', description: 'Show this cheat sheet' },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-panel relative mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--color-border)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            ⌨️ Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                {section.title}
              </h3>
              <div className="flex flex-col gap-0.5">
                {section.shortcuts.map((s) => (
                  <div
                    key={s.keys}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--color-surface-soft)]"
                  >
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {s.description}
                    </span>
                    <kbd className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[10px] text-[var(--color-text-muted)]">
          Press <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1 py-0.5 font-mono text-[9px]">?</kbd> or <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1 py-0.5 font-mono text-[9px]">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
});
