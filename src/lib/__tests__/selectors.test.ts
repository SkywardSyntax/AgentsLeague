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

  it('returns structurally equal results for identical input', () => {
    const store = makeStore();
    const a = selectChatMeta(store);
    const b = selectChatMeta(store);
    expect(a).toEqual(b);
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
