import { useEffect, useRef } from 'react';

interface ShortcutActions {
  focusInput: () => void;
  newChat: () => void;
  cancelStream: () => void;
  prevChat: () => void;
  nextChat: () => void;
  resetZoom: () => void;
  togglePanel?: () => void;
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

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

      // Ctrl+0 — reset zoom
      if (mod && e.key === '0') {
        e.preventDefault();
        a.resetZoom();
        return;
      }

      // Ctrl+Shift+M — toggle panel (mobile)
      if (mod && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        a.togglePanel?.();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
