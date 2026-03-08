import { useEffect, useRef } from 'react';

interface ShortcutActions {
  focusInput: () => void;
  newChat: () => void;
  cancelStream: () => void;
  prevChat: () => void;
  nextChat: () => void;
  togglePanel?: () => void;
  toggleInjector?: () => void;
  undo?: () => void;
  redo?: () => void;
  openExport?: () => void;
  saveSnapshot?: () => void;
  copyShareUrl?: () => void;
  showShortcuts?: () => void;
  selectAll?: () => void;
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  const actionsRef = useRef(actions);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const { current: a } = actionsRef;

      // Escape works even in inputs
      if (e.key === 'Escape') {
        a.cancelStream();
        return;
      }

      // Skip other shortcuts when in text fields
      if (isInput) return;

      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+Shift+K — focus chat input (avoids Cmd+K browser conflict)
      if (mod && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        a.focusInput();
        return;
      }

      // Ctrl+Shift+N — new chat
      if (mod && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        a.newChat();
        return;
      }

      // Ctrl+[ / Ctrl+] — prev/next chat
      if (mod && e.key === '[') {
        e.preventDefault();
        a.prevChat();
        return;
      }
      if (mod && e.key === ']') {
        e.preventDefault();
        a.nextChat();
        return;
      }

      // Cmd/Ctrl+Z — undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y — redo
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          a.redo?.();
        } else {
          a.undo?.();
        }
        return;
      }
      if (mod && e.key === 'y') {
        e.preventDefault();
        a.redo?.();
        return;
      }

      // Ctrl+0 — fit-to-content (handled by WhiteboardCanvas)

      // Ctrl+Shift+M — toggle panel (mobile)
      if (mod && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        a.togglePanel?.();
        return;
      }

      // Ctrl+Shift+I — toggle draw injector
      if (mod && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        a.toggleInjector?.();
        return;
      }

      // Ctrl+E / Cmd+E — open export dialog
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        a.openExport?.();
        return;
      }

      // Ctrl+S / Cmd+S — save snapshot
      if (mod && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        a.saveSnapshot?.();
        return;
      }

      // Ctrl+Shift+C / Cmd+Shift+C — copy share URL
      if (mod && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        a.copyShareUrl?.();
        return;
      }

      // Ctrl+A / Cmd+A — select all (canvas context)
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        a.selectAll?.();
        return;
      }

      // ? — show keyboard shortcuts cheat sheet (only when no modifier)
      if (e.key === '?' && !mod && !e.altKey) {
        e.preventDefault();
        a.showShortcuts?.();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
