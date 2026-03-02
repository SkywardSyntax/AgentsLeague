import type { ChatStore } from './chatSessionReducer';
import type { AppStatus } from './statusMachine';

export interface ChatThreadMeta {
  id: string;
  title: string;
  messageCount: number;
}

/** Derives the ordered list of chat metadata for the tab bar. */
export function selectChatMeta(store: ChatStore): ChatThreadMeta[] {
  return store.chatOrder.map((id) => {
    const chat = store.chats[id]!;
    return {
      id: chat.id,
      title: chat.title,
      messageCount: chat.messages.length,
    };
  });
}

/** Returns warnings for a specific chat, or empty array if chat doesn't exist. */
export function selectActiveWarnings(store: ChatStore, chatId: string): string[] {
  return store.chats[chatId]?.warnings ?? [];
}

/** Extracts the current turn status. */
export function selectTurnStatus(store: ChatStore): AppStatus {
  return store.turn.status;
}
