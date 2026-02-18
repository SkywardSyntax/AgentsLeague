'use client';

import { useCallback, useEffect, useRef } from 'react';

// ── Action callbacks supplied by the consumer ─────────────────────

export interface KeyboardShortcutActions {
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectAll?: () => void;
  onDelete?: () => void;
  onMove?: (dx: number, dy: number) => void;
  onDeselectAll?: () => void;
  onPanModeStart?: () => void;
  onPanModeEnd?: () => void;
  onSave?: () => void;
  onToggleDarkMode?: () => void;
  onShowShortcuts?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

function isMod(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

function isTextInput(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

// ── Hook ────────────────────────────────────────────────────────────

export function useKeyboardShortcuts(actions: KeyboardShortcutActions): void {
  // Use a ref so the effect closure always sees the latest callbacks
  // without needing to re-attach the listener on every render.
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const a = actionsRef.current;
    const mod = isMod(e);
    const textFocused = isTextInput(e);

    // ── Ctrl/Cmd+Shift+D: Toggle dark mode ──────────────────────
    if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      a.onToggleDarkMode?.();
      return;
    }

    // ── Ctrl/Cmd+Z: Undo ────────────────────────────────────────
    if (mod && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      a.onUndo?.();
      return;
    }

    // ── Ctrl/Cmd+Y: Redo ────────────────────────────────────────
    if (mod && e.key === 'y') {
      e.preventDefault();
      a.onRedo?.();
      return;
    }

    // ── Ctrl/Cmd+A: Select all (only on canvas) ────────────────
    if (mod && (e.key === 'a' || e.key === 'A') && !textFocused) {
      e.preventDefault();
      a.onSelectAll?.();
      return;
    }

    // ── Ctrl/Cmd+S: Save ────────────────────────────────────────
    if (mod && e.key === 's') {
      e.preventDefault();
      a.onSave?.();
      return;
    }

    // Skip remaining non-modifier shortcuts when typing in an input
    if (textFocused) return;

    // ── Delete / Backspace: Delete selected ─────────────────────
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      a.onDelete?.();
      return;
    }

    // ── Arrow keys: Move selected elements ──────────────────────
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        a.onMove?.(0, -step);
        return;
      case 'ArrowDown':
        e.preventDefault();
        a.onMove?.(0, step);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        a.onMove?.(-step, 0);
        return;
      case 'ArrowRight':
        e.preventDefault();
        a.onMove?.(step, 0);
        return;
    }

    // ── Escape: Deselect all ────────────────────────────────────
    if (e.key === 'Escape') {
      a.onDeselectAll?.();
      return;
    }

    // ── Space: Pan mode (while held) ────────────────────────────
    if (e.key === ' ' && !e.repeat) {
      e.preventDefault();
      a.onPanModeStart?.();
      return;
    }

    // ── ?: Show keyboard shortcuts modal ────────────────────────
    if (e.key === '?') {
      a.onShowShortcuts?.();
      return;
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ') {
      actionsRef.current.onPanModeEnd?.();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);
}
