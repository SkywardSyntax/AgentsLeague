import { useEffect } from 'react';

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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Escape works even in inputs
      if (e.key === 'Escape') {
        actions.cancelStream();
        return;
      }

      // Skip other shortcuts when in text fields
      if (isInput) return;

      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+Shift+K — focus chat input (avoids Cmd+K browser conflict)
      if (mod && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        actions.focusInput();
        return;
      }

      // Ctrl+Shift+N — new chat
      if (mod && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        actions.newChat();
        return;
      }

      // Ctrl+[ / Ctrl+] — prev/next chat
      if (mod && e.key === '[') {
        e.preventDefault();
        actions.prevChat();
        return;
      }
      if (mod && e.key === ']') {
        e.preventDefault();
        actions.nextChat();
        return;
      }

      // Ctrl+0 — reset zoom
      if (mod && e.key === '0') {
        e.preventDefault();
        actions.resetZoom();
        return;
      }

      // Ctrl+Shift+M — toggle panel (mobile)
      if (mod && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        actions.togglePanel?.();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}
