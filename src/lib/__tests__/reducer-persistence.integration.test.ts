import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  chatSessionReducer,
  createEmptyChatSession,
  createInitialTurn,
  createMessage,
  withoutStreamOverlay,
  buildRestoreBatch,
  type ChatStore,
  type ChatSessionState,
} from '../state/chatSessionReducer';
import { loadSession, saveSession, type PersistedSessionV3 } from '../client/persistence';

// ── Helpers ────────────────────────────────────────────────────────────

function createStorageMock(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

function makeStore(overrides?: Partial<ChatStore>): ChatStore {
  const chat = createEmptyChatSession(1);
  return {
    chatOrder: [chat.id],
    chats: { [chat.id]: chat },
    turn: createInitialTurn(),
    ...overrides,
  };
}

function chatId(store: ChatStore): string {
  return store.chatOrder[0]!;
}

/** Convert ChatStore to PersistedSessionV3 for save, mirroring AppShell logic. */
function storeToPersistedSession(store: ChatStore, activeChatId: string): PersistedSessionV3 {
  return {
    version: 3,
    updatedAt: Date.now(),
    activeChatId,
    chats: store.chatOrder.map((id) => {
      const chat = withoutStreamOverlay(store.chats[id]!);
      return {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: chat.messages,
        scene: chat.scene,
        semanticScene: chat.semanticScene,
        plannerMeta: chat.plannerMeta,
        warnings: chat.warnings.length > 0 ? chat.warnings.map(w => w.message) : undefined,
      };
    }),
    prefs: { panelSizes: [62, 38] },
  };
}

/** Restore a loaded session into a ChatStore, mirroring AppShell's restore logic. */
function restoreFromLoaded(loaded: PersistedSessionV3): ChatStore {
  const newChats: Record<string, ChatSessionState> = {};
  const newOrder: string[] = [];
  const activeExists = loaded.chats.some((c) => c.id === loaded.activeChatId);
  const activeId = activeExists ? loaded.activeChatId : loaded.chats[0]!.id;

  for (const chat of loaded.chats) {
    newOrder.push(chat.id);
    newChats[chat.id] = {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messages: chat.messages,
      scene: chat.scene,
      semanticScene: chat.semanticScene ?? [],
      plannerMeta: chat.plannerMeta ?? [],
      batches: chat.id === activeId ? buildRestoreBatch(chat.id, chat.scene) : [],
      warnings: (chat.warnings ?? []).map((msg, i) => ({ id: `restored-${i}`, message: msg, severity: 'warning' as const })),
    };
  }

  const store = makeStore();
  return chatSessionReducer(store, { type: 'RESTORE_SESSION', chats: newChats, chatOrder: newOrder });
}

/**
 * Normalize volatile fields (timestamps, batch IDs) for comparison.
 * Strips updatedAt, createdAt, batch_id patterns, and message.id/createdAt.
 */
function normalizeForComparison(chat: ChatSessionState) {
  return {
    id: chat.id,
    title: chat.title,
    messages: chat.messages.map((m) => ({ role: m.role, content: m.content })),
    scene: chat.scene,
    semanticScene: chat.semanticScene,
    plannerMeta: chat.plannerMeta,
    warnings: chat.warnings,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Reducer ↔ Persistence round-trip integration', () => {
  let origLocalStorage: Storage;

  beforeEach(() => {
    origLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: createStorageMock(), writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: origLocalStorage, writable: true, configurable: true });
  });

  it('dispatches actions, saves, loads, restores, and preserves chat content', () => {
    let store = makeStore();
    const id = chatId(store);

    // Simulate a user message + assistant response
    const userMsg = createMessage('user', 'Explain integration testing');
    store = chatSessionReducer(store, { type: 'ADD_USER_MESSAGE', chatId: id, message: userMsg, rawContent: 'Explain integration testing' });
    store = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
    store = chatSessionReducer(store, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'Integration testing verifies ' });
    store = chatSessionReducer(store, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'that modules work together.' });
    store = chatSessionReducer(store, { type: 'FINALIZE_ASSISTANT_MESSAGE' });
    store = chatSessionReducer(store, { type: 'TURN_DONE', chatId: id });

    expect(store.chats[id]!.messages).toHaveLength(2);

    // Save to localStorage
    const persisted = storeToPersistedSession(store, id);
    saveSession(persisted);

    // Load from localStorage and restore
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    const restored = restoreFromLoaded(loaded!);

    // Compare normalized state (excluding volatile timestamps/IDs)
    const originalNorm = normalizeForComparison(store.chats[id]!);
    const restoredNorm = normalizeForComparison(restored.chats[id]!);
    expect(restoredNorm.title).toBe(originalNorm.title);
    expect(restoredNorm.messages).toEqual(originalNorm.messages);
    expect(restoredNorm.scene).toEqual(originalNorm.scene);
    expect(restored.chatOrder).toEqual(store.chatOrder);
  });

  it('handles corrupt/schema-drifted blob gracefully without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Store a valid session first
    let store = makeStore();
    const id = chatId(store);
    const userMsg = createMessage('user', 'test');
    store = chatSessionReducer(store, { type: 'ADD_USER_MESSAGE', chatId: id, message: userMsg, rawContent: 'test' });
    saveSession(storeToPersistedSession(store, id));

    // Now corrupt the blob by removing required fields
    const raw = localStorage.getItem('agentsleague:session:v1')!;
    const parsed = JSON.parse(raw);
    delete parsed.chats;
    localStorage.setItem('agentsleague:session:v1', JSON.stringify(parsed));

    // Load should return null, not throw
    const loaded = loadSession();
    expect(loaded).toBeNull();
    consoleSpy.mockRestore();
  });

  it('withoutStreamOverlay strips transient fields before save so restore has no phantom streaming state', () => {
    let store = makeStore();
    const id = chatId(store);

    // Simulate adding a provisional stream overlay batch
    const provisionalBatch = {
      batch_id: `stream-provisional-${Date.now()}`,
      style_preset: 'clean_pen_sketch' as const,
      elements: [{ id: 'el-1', type: 'rect' as const, x: 0, y: 0, w: 10, h: 10 }],
    };
    store = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
    store = chatSessionReducer(store, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch: provisionalBatch });
    store = chatSessionReducer(store, { type: 'TURN_DONE', chatId: id });

    // Save with withoutStreamOverlay applied (like AppShell does)
    const persisted = storeToPersistedSession(store, id);
    saveSession(persisted);

    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    const restored = restoreFromLoaded(loaded!);

    // No stream-provisional batches should survive restore
    const restoredChat = restored.chats[id]!;
    const hasProvisional = restoredChat.batches.some((b) => b.batch_id.startsWith('stream-provisional-'));
    expect(hasProvisional).toBe(false);
  });

  it('preserves multi-chat state across save/restore cycle', () => {
    const chat1 = createEmptyChatSession(1);
    const chat2 = createEmptyChatSession(2);
    let store: ChatStore = {
      chatOrder: [chat1.id, chat2.id],
      chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
      turn: createInitialTurn(),
    };

    // Add messages to each chat
    const msg1 = createMessage('user', 'Chat 1 message');
    store = chatSessionReducer(store, { type: 'ADD_USER_MESSAGE', chatId: chat1.id, message: msg1, rawContent: 'Chat 1 message' });
    const msg2 = createMessage('user', 'Chat 2 message');
    store = chatSessionReducer(store, { type: 'ADD_USER_MESSAGE', chatId: chat2.id, message: msg2, rawContent: 'Chat 2 message' });

    saveSession(storeToPersistedSession(store, chat1.id));
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    const restored = restoreFromLoaded(loaded!);

    expect(restored.chatOrder).toEqual([chat1.id, chat2.id]);
    expect(restored.chats[chat1.id]!.messages[0]!.content).toBe('Chat 1 message');
    expect(restored.chats[chat2.id]!.messages[0]!.content).toBe('Chat 2 message');
  });

  it('cancel always leaves turn status idle after restore', () => {
    let store = makeStore();
    const id = chatId(store);

    // Start a turn, then immediately end with error
    store = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
    store = chatSessionReducer(store, { type: 'TURN_ERROR', chatId: id, errorMessage: 'cancelled' });
    expect(store.turn.status).toBe('idle');

    // Save, restore, verify idle
    saveSession(storeToPersistedSession(store, id));
    const loaded = loadSession();
    const restored = restoreFromLoaded(loaded!);
    expect(restored.turn.status).toBe('idle');
  });
});
