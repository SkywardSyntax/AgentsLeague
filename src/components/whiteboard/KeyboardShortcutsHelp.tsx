'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';

interface Shortcut {
  keys: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: '⌘/Ctrl + Z', description: 'Undo' },
  { keys: '⌘/Ctrl + Shift + Z', description: 'Redo' },
  { keys: '⌘/Ctrl + A', description: 'Select all' },
  { keys: '⌘/Ctrl + 0', description: 'Fit to canvas' },
  { keys: '⌘/Ctrl + +/−', description: 'Zoom in / out' },
  { keys: '⌘/Ctrl + ⌫', description: 'Clear canvas' },
  { keys: '⌘/Ctrl + E', description: 'Open export' },
  { keys: '⌘/Ctrl + I', description: 'Toggle injector' },
  { keys: '⌘/Ctrl + S', description: 'Save snapshot' },
  { keys: '⌘/Ctrl + Shift + C', description: 'Copy share URL' },
  { keys: 'Ctrl + Shift + K', description: 'Focus chat input' },
  { keys: 'Ctrl + Shift + N', description: 'New chat' },
  { keys: 'Ctrl + Enter', description: 'Validate + inject (in editor)' },
  { keys: 'Ctrl + Shift + F', description: 'Format JSON (in editor)' },
  { keys: 'Esc', description: 'Close panel / cancel stream' },
  { keys: '?', description: 'Shortcut cheat sheet' },
];

export const KeyboardShortcutsHelp = memo(function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Keyboard shortcuts"
        className="glass-panel flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] transition-all duration-150 hover:bg-[var(--color-surface)] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        ?
      </button>

      {open && (
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="animate-dropdown-in absolute bottom-full right-0 mb-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl"
        >
          <h3 className="mb-2 text-xs font-semibold text-[var(--color-text-primary)]">
            ⌨️ Keyboard Shortcuts
          </h3>
          <div className="flex flex-col gap-1">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-[11px] text-[var(--color-text-secondary)]">{s.description}</span>
                <kbd className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
