'use client';

import { create } from 'zustand';
import {
  InteractionMode,
  type MessageRole,
  type Message,
} from '@/types/interaction';

// ── Store Interface ─────────────────────────────────────────────

interface ConversationStore {
  messages: Message[];
  mode: InteractionMode;
  isProcessing: boolean;

  addMessage: (content: string, role: MessageRole, options?: Partial<Pick<Message, 'source' | 'drawing' | 'reasoning' | 'meta'>>) => Message;
  deleteMessage: (id: string) => void;
  clearHistory: () => void;
  setMode: (mode: InteractionMode) => void;
  setProcessing: (isProcessing: boolean) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
}

// ── Store Implementation ────────────────────────────────────────

export const useConversationStore = create<ConversationStore>((set, get) => ({
  messages: [],
  mode: InteractionMode.TEXT,
  isProcessing: false,

  addMessage: (content, role, options = {}) => {
    const message: Message = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
      source: options.source ?? get().mode,
      drawing: options.drawing ?? null,
      reasoning: options.reasoning ?? null,
      ...(options.meta !== undefined ? { meta: options.meta } : {}),
    };
    set((state) => ({ messages: [...state.messages, message] }));
    return message;
  },

  deleteMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),

  clearHistory: () => set({ messages: [] }),

  setMode: (mode) => set({ mode }),

  setProcessing: (isProcessing) => set({ isProcessing }),

  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...patch } : m,
      ),
    })),
}));
