import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSessionManager } from '@/hooks/useSessionManager';

const PERSIST_KEY = 'agentsleague:session:v1';

// Node 21+ built-in localStorage lacks Web Storage API methods; provide a mock
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _reset: () => { store = {}; },
  };
})();

beforeEach(() => {
  storageMock._reset();
  storageMock.getItem.mockClear();
  storageMock.setItem.mockClear();
  Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true, configurable: true });
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSessionManager', () => {
  it('returns one empty chat session on initial render', () => {
    const { result } = renderHook(() => useSessionManager());
    expect(result.current.chatSessions).toHaveLength(1);
    expect(result.current.chatSessions[0].messages).toHaveLength(0);
    expect(result.current.activeChatId).toBe(result.current.chatSessions[0].id);
    expect(result.current.activeChat.id).toBe(result.current.chatSessions[0].id);
  });

  it('createChat adds a session and sets it active', () => {
    const { result } = renderHook(() => useSessionManager());
    const originalId = result.current.activeChatId;

    act(() => {
      result.current.createChat();
    });

    expect(result.current.chatSessions).toHaveLength(2);
    expect(result.current.activeChatId).not.toBe(originalId);
    // New chat is prepended
    expect(result.current.chatSessions[0].id).toBe(result.current.activeChatId);
  });

  it('selectChat changes activeChatId without modifying sessions', () => {
    const { result } = renderHook(() => useSessionManager());

    act(() => {
      result.current.createChat();
    });

    const secondChatId = result.current.activeChatId;
    const firstChatId = result.current.chatSessions[1].id;

    act(() => {
      result.current.selectChat(firstChatId);
    });

    expect(result.current.activeChatId).toBe(firstChatId);
    expect(result.current.chatSessions).toHaveLength(2);
    // Sessions unchanged
    expect(result.current.chatSessions.map((c) => c.id)).toContain(secondChatId);
  });

  it('selectChat is a no-op when selecting the already active chat', () => {
    const { result } = renderHook(() => useSessionManager());
    const initial = result.current.activeChatId;

    act(() => {
      result.current.selectChat(initial);
    });

    expect(result.current.activeChatId).toBe(initial);
  });

  it('deleteChat removes chat and switches active to adjacent', () => {
    const { result } = renderHook(() => useSessionManager());

    act(() => {
      result.current.createChat();
    });
    act(() => {
      result.current.createChat();
    });

    expect(result.current.chatSessions).toHaveLength(3);
    const toDelete = result.current.chatSessions[1].id;

    act(() => {
      result.current.deleteChat(toDelete);
    });

    expect(result.current.chatSessions).toHaveLength(2);
    expect(result.current.chatSessions.some((c) => c.id === toDelete)).toBe(false);
  });

  it('deleteChat with last remaining chat creates a fresh empty session', () => {
    const { result } = renderHook(() => useSessionManager());
    const originalId = result.current.activeChatId;

    act(() => {
      result.current.deleteChat(originalId);
    });

    // Flush any pending timers (persist debounce etc.)
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.chatSessions).toHaveLength(1);
    expect(result.current.chatSessions[0].id).not.toBe(originalId);
    expect(result.current.chatSessions[0].messages).toHaveLength(0);
    // Active chat should have been updated to the replacement
    expect(result.current.activeChat.id).toBe(result.current.chatSessions[0].id);
  });

  it('persist session debounces and writes to localStorage', () => {
    const { result } = renderHook(() => useSessionManager());

    // didRestoreSession is set after mount effect
    act(() => {
      vi.advanceTimersByTime(0);
    });

    // Trigger state change to fire persist effect
    act(() => {
      result.current.createChat();
    });

    // Advance past the 500ms debounce
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(storageMock.setItem).toHaveBeenCalled();
    const lastCall = storageMock.setItem.mock.calls[storageMock.setItem.mock.calls.length - 1];
    expect(lastCall[0]).toBe(PERSIST_KEY);
    const parsed = JSON.parse(lastCall[1]);
    expect(parsed.version).toBe(3);
    expect(parsed.chats).toHaveLength(2);
  });

  it('sessionId is a stable string', () => {
    const { result, rerender } = renderHook(() => useSessionManager());
    const id1 = result.current.sessionId;
    rerender();
    expect(result.current.sessionId).toBe(id1);
  });

  it('selectChat during active stream aborts the stream', () => {
    const { result } = renderHook(() => useSessionManager());

    act(() => {
      result.current.createChat();
    });

    const streamingChatId = result.current.chatSessions[1].id;
    const targetChatId = result.current.chatSessions[0].id;

    // Select the non-active chat first so we stream from it
    act(() => {
      result.current.selectChat(streamingChatId);
    });
    expect(result.current.activeChatId).toBe(streamingChatId);

    const cancelFn = vi.fn();
    const resetFn = vi.fn();

    // Now switch away with active stream opts
    act(() => {
      result.current.selectChat(targetChatId, {
        cancel: cancelFn,
        resetStreamState: resetFn,
        streamChatId: streamingChatId,
      });
    });

    expect(result.current.activeChatId).toBe(targetChatId);
    expect(cancelFn).toHaveBeenCalledOnce();
    expect(resetFn).toHaveBeenCalledOnce();
  });

  it('selectChat does not abort when stream belongs to a different chat', () => {
    const { result } = renderHook(() => useSessionManager());

    act(() => {
      result.current.createChat();
    });

    const targetChatId = result.current.chatSessions[1].id;
    const cancelFn = vi.fn();

    act(() => {
      result.current.selectChat(targetChatId, {
        cancel: cancelFn,
        streamChatId: 'some-other-chat-id',
      });
    });

    expect(result.current.activeChatId).toBe(targetChatId);
    expect(cancelFn).not.toHaveBeenCalled();
  });

  it('deleteChat on active chat switches to next available chat first', () => {
    const { result } = renderHook(() => useSessionManager());

    act(() => {
      result.current.createChat();
    });
    act(() => {
      result.current.createChat();
    });

    expect(result.current.chatSessions).toHaveLength(3);
    const activeId = result.current.activeChatId;

    act(() => {
      result.current.deleteChat(activeId);
    });

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.chatSessions).toHaveLength(2);
    expect(result.current.chatSessions.some((c) => c.id === activeId)).toBe(false);
    // activeChat resolves to a valid remaining chat
    expect(result.current.chatSessions.some((c) => c.id === result.current.activeChat.id)).toBe(true);
  });

  it('rapid createChat + selectChat results in consistent state', () => {
    const { result } = renderHook(() => useSessionManager());

    act(() => {
      result.current.createChat();
      result.current.createChat();
      result.current.createChat();
    });

    expect(result.current.chatSessions).toHaveLength(4);
    const ids = result.current.chatSessions.map((c) => c.id);
    // All IDs unique
    expect(new Set(ids).size).toBe(4);

    // Rapid switching
    act(() => {
      result.current.selectChat(ids[2]!);
    });
    act(() => {
      result.current.selectChat(ids[0]!);
    });

    expect(result.current.activeChatId).toBe(ids[0]);
    // Sessions unchanged
    expect(result.current.chatSessions).toHaveLength(4);
  });

  it('double deleteChat in rapid succession leaves valid activeChatId', () => {
    const { result } = renderHook(() => useSessionManager());

    act(() => {
      result.current.createChat();
    });
    act(() => {
      result.current.createChat();
    });
    act(() => {
      result.current.createChat();
    });

    expect(result.current.chatSessions).toHaveLength(4);
    const firstId = result.current.chatSessions[1].id;
    const secondId = result.current.chatSessions[2].id;

    // Select the first so active is not the ones being deleted
    act(() => {
      result.current.selectChat(result.current.chatSessions[0].id);
    });

    // Rapid double-delete
    act(() => {
      result.current.deleteChat(firstId);
      result.current.deleteChat(secondId);
    });

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.chatSessions).toHaveLength(2);
    // activeChatId must exist in remaining sessions
    expect(result.current.chatSessions.some((c) => c.id === result.current.activeChatId)).toBe(true);
    // No stale IDs remain
    expect(result.current.chatSessions.some((c) => c.id === firstId)).toBe(false);
    expect(result.current.chatSessions.some((c) => c.id === secondId)).toBe(false);
  });

  it('selectChat with nonexistent chatId is a no-op', () => {
    const { result } = renderHook(() => useSessionManager());
    const originalId = result.current.activeChatId;

    act(() => {
      result.current.selectChat('nonexistent-id');
    });

    expect(result.current.activeChatId).toBe(originalId);
  });

  it('loadSession throwing does not crash the hook', () => {
    // Arrange: put invalid JSON in storage so loadSession's JSON.parse throws
    storageMock.setItem('agentsleague:session:v1', '{CORRUPT DATA!!!');

    const { result } = renderHook(() => useSessionManager());

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.didRestoreSession).toBe(true);
    expect(result.current.chatSessions).toHaveLength(1);
    expect(result.current.chatSessions[0].messages).toHaveLength(0);
  });
});
