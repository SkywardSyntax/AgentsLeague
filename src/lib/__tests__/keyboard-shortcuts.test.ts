import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function makeActions() {
  return {
    focusInput: vi.fn(),
    newChat: vi.fn(),
    cancelStream: vi.fn(),
    prevChat: vi.fn(),
    nextChat: vi.fn(),
    resetZoom: vi.fn(),
    togglePanel: vi.fn(),
  };
}

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}, target?: HTMLElement) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
  (target ?? document).dispatchEvent(event);
}

describe('useKeyboardShortcuts', () => {
  let actions: ReturnType<typeof makeActions>;

  beforeEach(() => {
    actions = makeActions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Escape calls cancelStream', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('Escape');
    expect(actions.cancelStream).toHaveBeenCalledOnce();
  });

  it('Ctrl+Shift+K calls focusInput', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('K', { ctrlKey: true, shiftKey: true });
    expect(actions.focusInput).toHaveBeenCalledOnce();
  });

  it('Ctrl+Shift+N calls newChat', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('N', { ctrlKey: true, shiftKey: true });
    expect(actions.newChat).toHaveBeenCalledOnce();
  });

  it('Ctrl+[ calls prevChat', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('[', { ctrlKey: true });
    expect(actions.prevChat).toHaveBeenCalledOnce();
  });

  it('Ctrl+] calls nextChat', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey(']', { ctrlKey: true });
    expect(actions.nextChat).toHaveBeenCalledOnce();
  });

  it('Ctrl+0 calls resetZoom', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('0', { ctrlKey: true });
    expect(actions.resetZoom).toHaveBeenCalledOnce();
  });

  it('Ctrl+Shift+M calls togglePanel', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('M', { ctrlKey: true, shiftKey: true });
    expect(actions.togglePanel).toHaveBeenCalledOnce();
  });

  it('metaKey (⌘) works as alternative to ctrlKey', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('K', { metaKey: true, shiftKey: true });
    expect(actions.focusInput).toHaveBeenCalledOnce();
  });

  it('non-Escape shortcuts are suppressed when target is INPUT', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      fireKey('K', { ctrlKey: true, shiftKey: true }, input);
      expect(actions.focusInput).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(input);
    }
  });

  it('non-Escape shortcuts are suppressed when target is TEXTAREA', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    try {
      fireKey('N', { ctrlKey: true, shiftKey: true }, textarea);
      expect(actions.newChat).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(textarea);
    }
  });

  it('Escape still works inside an INPUT', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      fireKey('Escape', {}, input);
      expect(actions.cancelStream).toHaveBeenCalledOnce();
    } finally {
      document.body.removeChild(input);
    }
  });

  it('togglePanel being undefined does not crash on Ctrl+Shift+M', () => {
    const actionsNoToggle = { ...actions, togglePanel: undefined };
    renderHook(() => useKeyboardShortcuts(actionsNoToggle));
    expect(() => fireKey('M', { ctrlKey: true, shiftKey: true })).not.toThrow();
  });

  it('plain key without modifier does not fire shortcut', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('K');
    expect(actions.focusInput).not.toHaveBeenCalled();
  });

  it('unknown key combination does not fire any action', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('Z', { ctrlKey: true, shiftKey: true });
    expect(actions.focusInput).not.toHaveBeenCalled();
    expect(actions.newChat).not.toHaveBeenCalled();
    expect(actions.cancelStream).not.toHaveBeenCalled();
    expect(actions.prevChat).not.toHaveBeenCalled();
    expect(actions.nextChat).not.toHaveBeenCalled();
    expect(actions.resetZoom).not.toHaveBeenCalled();
    expect(actions.togglePanel).not.toHaveBeenCalled();
  });

  it('multiple rapid Escape presses call cancelStream each time', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('Escape');
    fireKey('Escape');
    fireKey('Escape');
    expect(actions.cancelStream).toHaveBeenCalledTimes(3);
  });

  it('key event with repeat: true still fires', () => {
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('Escape', { repeat: true });
    expect(actions.cancelStream).toHaveBeenCalledOnce();
  });

  it('registers keydown listener only once across re-renders with new action callbacks', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { rerender } = renderHook(
      (props: ReturnType<typeof makeActions>) => useKeyboardShortcuts(props),
      { initialProps: actions },
    );

    const addCountAfterMount = addSpy.mock.calls.filter(
      ([ev]) => ev === 'keydown',
    ).length;
    expect(addCountAfterMount).toBe(1);

    // Re-render with brand-new actions object — listener should NOT be re-added
    const actions2 = makeActions();
    rerender(actions2);

    const addCountAfterRerender = addSpy.mock.calls.filter(
      ([ev]) => ev === 'keydown',
    ).length;
    expect(addCountAfterRerender).toBe(1);

    // Remove listener should NOT have been called (no re-subscribe)
    const removeCount = removeSpy.mock.calls.filter(
      ([ev]) => ev === 'keydown',
    ).length;
    expect(removeCount).toBe(0);

    // The latest actions should still be invoked
    fireKey('Escape');
    expect(actions2.cancelStream).toHaveBeenCalledOnce();
    expect(actions.cancelStream).not.toHaveBeenCalled();

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
