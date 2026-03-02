import { describe, it, expect } from 'vitest';
import {
  createEmptyChatSession,
  createInitialTurn,
  createMessage,
  type ChatStore,
} from '../state/chatSessionReducer';
import {
  selectChatMeta,
  selectActiveWarnings,
  selectTurnStatus,
  createSelector,
} from '../state/selectors';

function makeStore(overrides?: Partial<ChatStore>): ChatStore {
  const chat = createEmptyChatSession(1);
  return {
    chatOrder: [chat.id],
    chats: { [chat.id]: chat },
    turn: createInitialTurn(),
    ...overrides,
  };
}

describe('selectChatMeta', () => {
  it('returns correct shape from multi-chat store', () => {
    const chat1 = createEmptyChatSession(1);
    const chat2 = createEmptyChatSession(2);
    chat1.title = 'Alpha';
    chat2.title = 'Beta';
    chat2.messages = [createMessage('user', 'hello')];
    const store: ChatStore = {
      chatOrder: [chat1.id, chat2.id],
      chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
      turn: createInitialTurn(),
    };

    const meta = selectChatMeta(store);
    expect(meta).toHaveLength(2);
    expect(meta[0]).toEqual({ id: chat1.id, title: 'Alpha', messageCount: 0 });
    expect(meta[1]).toEqual({ id: chat2.id, title: 'Beta', messageCount: 1 });
  });

  it('returns the same reference for identical store (memoized)', () => {
    const store = makeStore();
    const a = selectChatMeta(store);
    const b = selectChatMeta(store);
    expect(a).toBe(b);
  });

  it('returns the same reference when only turn state changes', () => {
    const store = makeStore();
    const a = selectChatMeta(store);
    // Mutate turn.status — selectChatMeta does not depend on it
    const store2: ChatStore = { ...store, turn: { ...store.turn, status: 'streaming' } };
    const b = selectChatMeta(store2);
    expect(a).toBe(b);
  });

  it('returns a new reference when a message is added', () => {
    const chat = createEmptyChatSession(1);
    const store: ChatStore = {
      chatOrder: [chat.id],
      chats: { [chat.id]: chat },
      turn: createInitialTurn(),
    };
    const a = selectChatMeta(store);
    expect(a[0].messageCount).toBe(0);

    const updatedChat = { ...chat, messages: [createMessage('user', 'hi')] };
    const store2: ChatStore = {
      ...store,
      chats: { [chat.id]: updatedChat },
    };
    const b = selectChatMeta(store2);
    expect(b).not.toBe(a);
    expect(b[0].messageCount).toBe(1);
  });

  it('preserves chatOrder ordering', () => {
    const chat1 = createEmptyChatSession(1);
    const chat2 = createEmptyChatSession(2);
    const chat3 = createEmptyChatSession(3);
    const store: ChatStore = {
      chatOrder: [chat3.id, chat1.id, chat2.id],
      chats: { [chat1.id]: chat1, [chat2.id]: chat2, [chat3.id]: chat3 },
      turn: createInitialTurn(),
    };
    const meta = selectChatMeta(store);
    expect(meta.map((m) => m.id)).toEqual([chat3.id, chat1.id, chat2.id]);
  });

  it('skips chatOrder entries with missing chats (corrupt state)', () => {
    const chat = createEmptyChatSession(1);
    const store: ChatStore = {
      chatOrder: [chat.id, 'ghost-id'],
      chats: { [chat.id]: chat },
      turn: createInitialTurn(),
    };
    const meta = selectChatMeta(store);
    expect(meta).toHaveLength(1);
    expect(meta[0].id).toBe(chat.id);
  });
});

describe('selectActiveWarnings', () => {
  it('returns warnings for existing chat', () => {
    const chat = createEmptyChatSession(1);
    chat.warnings = ['warn1', 'warn2'];
    const store: ChatStore = {
      chatOrder: [chat.id],
      chats: { [chat.id]: chat },
      turn: createInitialTurn(),
    };
    expect(selectActiveWarnings(store, chat.id)).toEqual(['warn1', 'warn2']);
  });

  it('returns empty array for nonexistent chat', () => {
    const store = makeStore();
    expect(selectActiveWarnings(store, 'no-such-id')).toEqual([]);
  });
});

describe('selectTurnStatus', () => {
  it('returns idle for initial turn', () => {
    const store = makeStore();
    expect(selectTurnStatus(store)).toBe('idle');
  });

  it('returns correct status after turn state changes', () => {
    const store = makeStore();
    store.turn = { ...store.turn, status: 'streaming' };
    expect(selectTurnStatus(store)).toBe('streaming');
  });
});

describe('createSelector', () => {
  it('returns the same reference when inputs are unchanged', () => {
    const inputs = { a: [1, 2, 3] };
    const sel = createSelector(
      (s: typeof inputs) => [s.a] as const,
      (a: number[]) => a.map((x) => x * 2),
    );
    const r1 = sel(inputs);
    const r2 = sel(inputs);
    expect(r1).toBe(r2);
  });

  it('recomputes when input reference changes', () => {
    let data = { items: ['a'] };
    const sel = createSelector(
      (s: typeof data) => [s.items] as const,
      (items: string[]) => items.join(','),
    );
    const r1 = sel(data);
    data = { items: ['a', 'b'] };
    const r2 = sel(data);
    expect(r1).not.toBe(r2);
    expect(r2).toBe('a,b');
  });
});
