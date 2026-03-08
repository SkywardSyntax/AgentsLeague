import type { ChatStore } from './chatSessionReducer';
import type { AppStatus } from './statusMachine';
import type { NotificationItem } from '@/components/app/WarningOverlay';

export interface Selector<S, R> {
  (state: S): R;
  resetSelector(): void;
}

type InferState<T> = T extends readonly ((state: infer S) => unknown)[] ? S : never;
type InferResults<T extends readonly ((state: never) => unknown)[]> = {
  [K in keyof T]: T[K] extends (state: never) => infer V ? V : never;
};

export function createSelector<
  Selectors extends readonly ((state: any) => unknown)[],
  R,
>(
  inputSelectors: [...Selectors],
  combiner: (...inputs: InferResults<Selectors>) => R,
): Selector<InferState<Selectors>, R> {
  type S = InferState<Selectors>;
  type I = InferResults<Selectors>;
  let lastInputs: I | undefined;
  let lastResult: R | undefined;
  let initialized = false;

  function arraysEqual(a: unknown[], b: unknown[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false; // reference equality
    }
    return true;
  }

  const selector = (state: S): R => {
    const inputs = inputSelectors.map((sel) => sel(state)) as unknown as I;

    if (initialized && lastInputs && arraysEqual(inputs as unknown as unknown[], lastInputs as unknown as unknown[])) {
      return lastResult!;
    }

    lastInputs = inputs;
    lastResult = combiner(...inputs);
    initialized = true;
    return lastResult;
  };

  selector.resetSelector = (): void => {
    lastInputs = undefined;
    lastResult = undefined;
    initialized = false;
  };

  return selector;
}

// ── Domain selectors ───────────────────────────────────────────────────

export const selectChatMeta = createSelector(
  [
    (s: ChatStore) => s.chatOrder,
    (s: ChatStore) => s.chats,
  ],
  (chatOrder, chats) =>
    chatOrder
      .filter((id) => id in chats)
      .map((id) => ({
        id,
        title: chats[id]!.title,
        messageCount: chats[id]!.messages.length,
      })),
);

export function selectActiveWarnings(store: ChatStore, chatId: string): NotificationItem[] {
  return store.chats[chatId]?.warnings ?? [];
}

export function selectTurnStatus(store: ChatStore): AppStatus {
  return store.turn.status;
}
