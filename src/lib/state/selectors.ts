import type { ChatStore } from './chatSessionReducer';
import type { AppStatus } from './statusMachine';

export interface ChatThreadMeta {
  id: string;
  title: string;
  messageCount: number;
}

/**
 * Minimal memoization helper: caches the result of `resultFn` and returns
 * the same reference when the inputs (by ===) haven't changed.
 */
export function createSelector<S, Inputs extends unknown[], R>(
  inputFn: (s: S) => [...Inputs],
  resultFn: (...inputs: Inputs) => R,
): (s: S) => R {
  let lastInputs: Inputs | undefined;
  let lastResult: R;

  return (s: S): R => {
    const inputs = inputFn(s);
    if (
      lastInputs !== undefined &&
      inputs.length === lastInputs.length &&
      inputs.every((v, i) => v === lastInputs![i])
    ) {
      return lastResult;
    }
    lastInputs = inputs;
    lastResult = resultFn(...inputs);
    return lastResult;
  };
}

/** Derives the ordered list of chat metadata for the tab bar (memoized). */
export const selectChatMeta = createSelector(
  (store: ChatStore) => [store.chatOrder, store.chats] as const,
  (chatOrder: ChatStore['chatOrder'], chats: ChatStore['chats']): ChatThreadMeta[] =>
    chatOrder.flatMap((id) => {
      const chat = chats[id];
      if (!chat) return [];
      return [{ id: chat.id, title: chat.title, messageCount: chat.messages.length }];
    }),
);

/** Returns warnings for a specific chat, or empty array if chat doesn't exist. */
export function selectActiveWarnings(store: ChatStore, chatId: string): string[] {
  return store.chats[chatId]?.warnings ?? [];
}

/** Extracts the current turn status. */
export function selectTurnStatus(store: ChatStore): AppStatus {
  return store.turn.status;
}
