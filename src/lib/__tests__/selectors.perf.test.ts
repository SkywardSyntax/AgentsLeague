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

/**
 * Builds a store with `chatCount` chats, each having `messagesPerChat` messages.
 */
function makeLargeStore(chatCount: number, messagesPerChat: number): ChatStore {
  const chatOrder: string[] = [];
  const chats: Record<string, ReturnType<typeof createEmptyChatSession>> = {};

  for (let i = 0; i < chatCount; i++) {
    const chat = createEmptyChatSession(i + 1);
    chat.warnings = [`warn-${i}`];
    for (let j = 0; j < messagesPerChat; j++) {
      chat.messages.push(createMessage(j % 2 === 0 ? 'user' : 'assistant', `Message ${j} in chat ${i}`));
    }
    chatOrder.push(chat.id);
    chats[chat.id] = chat;
  }

  return {
    chatOrder,
    chats,
    turn: createInitialTurn(),
  };
}

describe('Selector performance baselines', () => {
  const store = makeLargeStore(50, 200);
  const ITERATIONS = 10_000;
  const THRESHOLD_MS = 50;

  it(`selectChatMeta: ${ITERATIONS} calls on 50 chats / 200 msgs under ${THRESHOLD_MS}ms`, () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      selectChatMeta(store);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(THRESHOLD_MS);
  });

  it(`selectActiveWarnings: ${ITERATIONS} calls under ${THRESHOLD_MS}ms`, () => {
    const targetId = store.chatOrder[25]!;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      selectActiveWarnings(store, targetId);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(THRESHOLD_MS);
  });

  it(`selectTurnStatus: ${ITERATIONS} calls under ${THRESHOLD_MS}ms`, () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      selectTurnStatus(store);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(THRESHOLD_MS);
  });

  it('selectChatMeta returns structurally equivalent results for same store', () => {
    const a = selectChatMeta(store);
    const b = selectChatMeta(store);
    expect(a).toEqual(b);
    expect(a).toHaveLength(50);
    expect(a[0]!.messageCount).toBe(200);
  });
});
