import type { ChatMessage } from '@/types/agent';

export interface OfflineQueue {
  enqueue(msg: ChatMessage): void;
  drain(): ChatMessage[];
  peek(): ChatMessage[];
  count(): number;
  onOnline(callback: (pending: ChatMessage[]) => void): void;
  /** Simulate connectivity restore — fires all onOnline listeners. */
  simulateOnline(): void;
}

export function createOfflineQueue(): OfflineQueue {
  let buffer: ChatMessage[] = [];
  const listeners: Array<(pending: ChatMessage[]) => void> = [];

  return {
    enqueue(msg) {
      buffer.push(msg);
    },

    drain() {
      const items = buffer;
      buffer = [];
      return items;
    },

    peek() {
      return [...buffer];
    },

    count() {
      return buffer.length;
    },

    onOnline(callback) {
      listeners.push(callback);
    },

    simulateOnline() {
      const snapshot = [...buffer];
      for (const cb of listeners) {
        cb(snapshot);
      }
    },
  };
}
