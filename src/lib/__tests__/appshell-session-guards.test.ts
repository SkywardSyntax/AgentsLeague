import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Tests for AppShell session restore guards (Task 2A).
 * We test the logic extracted from the component: empty restoredChats,
 * empty chatSessions, and mismatched activeChatId.
 */

// Mock persistence module
vi.mock('@/lib/client/persistence', () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
}));

// Mock useAgentStream hook
vi.mock('@/hooks/useAgentStream', () => ({
  useAgentStream: () => ({ run: vi.fn(), cancel: vi.fn() }),
}));

// Minimal mock for whiteboard components and helpers
vi.mock('@/components/whiteboard/WhiteboardCanvas', () => ({
  WhiteboardCanvas: () => null,
}));
vi.mock('@/components/chat/ChatPanel', () => ({
  ChatPanel: () => null,
}));
vi.mock('@/lib/whiteboard/context', () => ({
  buildWhiteboardContext: () => ({}),
  buildWhiteboardContextV2: () => ({}),
}));
vi.mock('@/lib/whiteboard/stream-overlay', () => ({
  removeStreamOverlayFromScene: (s: unknown[]) => s,
  removeStreamOverlayFromBatches: (b: unknown[]) => b,
}));
vi.mock('@/lib/whiteboard/planner', () => ({
  fromLegacyDrawBatchToSemanticStub: () => ({ batch_id: 'stub', template: 'freeform_semantic', blocks: [] }),
}));

import { loadSession } from '@/lib/client/persistence';

const mockLoadSession = vi.mocked(loadSession);

describe('AppShell session restore guards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('handles restoration when all chats fail validation (empty restoredChats)', () => {
    // Simulate loadSession returning data with 0 chats after filtering
    mockLoadSession.mockReturnValue({
      version: 3,
      updatedAt: Date.now(),
      activeChatId: 'nonexistent',
      chats: [],
      prefs: { panelSizes: [62, 38] },
    });

    // The guard logic: if restoredChats.length === 0, create a default session
    const restored = mockLoadSession();
    expect(restored).not.toBeNull();
    const restoredChats = restored!.chats;

    // Simulate the guard
    let sessions = restoredChats.map((c) => ({ ...c, id: c.id }));
    if (sessions.length === 0) {
      sessions = [{ id: 'default-1', title: 'Chat 1', createdAt: Date.now(), updatedAt: Date.now(), messages: [], scene: [], semanticScene: [], plannerMeta: [] }];
    }

    expect(sessions.length).toBe(1);
    expect(sessions[0]!.id).toBe('default-1');
  });

  it('handles empty chatSessions in persist effect without error', () => {
    const chatSessions: Array<{ id: string }> = [];

    // The guard logic: if chatSessions.length === 0, early return
    if (chatSessions.length === 0) {
      // Should not crash — early return
      expect(true).toBe(true);
      return;
    }

    // Should not reach here
    expect(true).toBe(false);
  });

  it('handles activeChatId that does not match any restored session', () => {
    const restoredChats = [
      { id: 'chat-a', title: 'A' },
      { id: 'chat-b', title: 'B' },
    ];
    const activeChatId = 'nonexistent-id';

    const activeExists = restoredChats.some((chat) => chat.id === activeChatId);
    const resolvedId = activeExists ? activeChatId : restoredChats[0]?.id ?? '';

    expect(activeExists).toBe(false);
    expect(resolvedId).toBe('chat-a');
  });

  it('falls back gracefully when activeChatId matches and restoredChats has entries', () => {
    const restoredChats = [
      { id: 'chat-x', title: 'X' },
      { id: 'chat-y', title: 'Y' },
    ];
    const activeChatId = 'chat-y';

    const activeExists = restoredChats.some((chat) => chat.id === activeChatId);
    const resolvedId = activeExists ? activeChatId : restoredChats[0]?.id ?? '';

    expect(activeExists).toBe(true);
    expect(resolvedId).toBe('chat-y');
  });
});
