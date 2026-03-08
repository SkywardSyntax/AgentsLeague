'use client';

import { useCallback, useMemo } from 'react';
import { useSessionManager, type ChatSessionState } from './useSessionManager';
import type { ChatMessage, DrawBatch, DrawElement } from '@/types/agent';
import type { ChatThreadMeta } from '@/components/chat/ChatPanel';
import type { NotificationItem } from '@/components/app/WarningOverlay';
import {
  removeStreamOverlayFromBatches,
  removeStreamOverlayFromScene,
} from '@/lib/whiteboard/stream-overlay';

// ─── Utility helpers (exported for use by sibling hooks) ────────

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createMessage(
  role: ChatMessage['role'],
  content: string,
  errorMeta?: ChatMessage['errorMeta'],
): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    createdAt: Date.now(),
    ...(errorMeta ? { errorMeta } : {}),
  };
}

export function looksDefaultTitle(title: string): boolean {
  return /^Chat \d+$/.test(title.trim());
}

export function buildChatTitleFromMessage(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New Chat';
  return normalized.length > 40 ? `${normalized.slice(0, 40)}…` : normalized;
}

export function withoutStreamOverlay(chat: ChatSessionState): ChatSessionState {
  const nextScene = removeStreamOverlayFromScene(chat.scene);
  const nextBatches = removeStreamOverlayFromBatches(chat.batches);
  if (nextScene === chat.scene && nextBatches === chat.batches) return chat;
  return { ...chat, scene: nextScene, batches: nextBatches };
}

/** Replay a batches array to reconstruct the flat element scene. */
export function rebuildSceneFromBatches(batches: DrawBatch[]): DrawElement[] {
  const scene: DrawElement[] = [];
  for (const batch of batches) {
    if (batch.elements.some((el) => el.type === 'clear')) {
      scene.length = 0;
    }
    for (const el of batch.elements) {
      if (el.type !== 'clear') scene.push(el);
    }
  }
  return scene;
}

// ─── Hook ───────────────────────────────────────────────────────

export function useChatSessions() {
  const session = useSessionManager();
  const { chatSessions, setChatSessions, activeChat } = session;

  const pushWarning = useCallback(
    (warning: string, targetChatId: string, severity: NotificationItem['severity'] = 'warning') => {
      if (!targetChatId) return;
      setChatSessions((prev) =>
        prev.map((chat) => {
          if (chat.id !== targetChatId) return chat;
          if (chat.warnings[chat.warnings.length - 1]?.message === warning) return chat;
          const item: NotificationItem = { id: createId(), message: warning, severity };
          return {
            ...chat,
            updatedAt: Date.now(),
            warnings: [...chat.warnings, item].slice(-8),
          };
        }),
      );
    },
    [setChatSessions],
  );

  const dismissWarnings = useCallback(() => {
    if (!activeChat) return;
    setChatSessions((prev) =>
      prev.map((chat) =>
        chat.id === activeChat.id ? { ...chat, warnings: [] } : chat,
      ),
    );
  }, [activeChat, setChatSessions]);

  const dismissOneWarning = useCallback(
    (notificationId: string) => {
      if (!activeChat) return;
      setChatSessions((prev) =>
        prev.map((chat) =>
          chat.id === activeChat.id
            ? { ...chat, warnings: chat.warnings.filter((w) => w.id !== notificationId) }
            : chat,
        ),
      );
    },
    [activeChat, setChatSessions],
  );

  const chatMeta = useMemo<ChatThreadMeta[]>(
    () =>
      chatSessions.map((chat) => ({
        id: chat.id,
        title: chat.title,
        messageCount: chat.messages.length,
      })),
    [chatSessions],
  );

  return {
    ...session,
    pushWarning,
    dismissWarnings,
    dismissOneWarning,
    chatMeta,
  };
}
