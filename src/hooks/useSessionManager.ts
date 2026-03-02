'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadSession, saveSession } from '@/lib/client/persistence';
import type {
  ChatMessage,
  DrawBatch,
  DrawElement,
  SemanticBatch,
  WhiteboardLayoutDiagnostics,
} from '@/types/agent';

export interface ChatSessionState {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  scene: DrawElement[];
  semanticScene: SemanticBatch[];
  plannerMeta: WhiteboardLayoutDiagnostics[];
  batches: DrawBatch[];
  warnings: string[];
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultChatTitle(index: number): string {
  return `Chat ${index}`;
}

export function createEmptyChatSession(index: number): ChatSessionState {
  const now = Date.now();
  return {
    id: createId(),
    title: defaultChatTitle(index),
    createdAt: now,
    updatedAt: now,
    messages: [],
    scene: [],
    semanticScene: [],
    plannerMeta: [],
    batches: [],
    warnings: [],
  };
}

function buildRestoreBatch(chatId: string, scene: DrawElement[]): DrawBatch[] {
  if (scene.length === 0) return [];
  return [
    {
      batch_id: `restore-${chatId}-${Date.now()}`,
      style_preset: 'clean_pen_sketch',
      elements: scene,
    },
  ];
}

export interface SessionManagerResult {
  chatSessions: ChatSessionState[];
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSessionState[]>>;
  activeChatId: string;
  activeChat: ChatSessionState;
  activeChatIdRef: React.RefObject<string>;
  didRestoreSession: boolean;
  sessionId: string;
  createChat: () => void;
  selectChat: (chatId: string, opts?: { cancel?: () => void; resetStreamState?: () => void; streamChatId?: string | null }) => void;
  deleteChat: (chatId: string, opts?: { cancel?: () => void; resetStreamState?: () => void; streamChatId?: string | null }) => void;
  panelSizes: [number, number];
  setPanelSizes: React.Dispatch<React.SetStateAction<[number, number]>>;
}

export function useSessionManager(): SessionManagerResult {
  const [seedChat] = useState<ChatSessionState>(() => createEmptyChatSession(1));
  const [chatSessions, setChatSessions] = useState<ChatSessionState[]>([seedChat]);
  const [activeChatId, setActiveChatId] = useState<string>(seedChat.id);
  const [didRestoreSession, setDidRestoreSession] = useState(false);
  const [panelSizes, setPanelSizes] = useState<[number, number]>([62, 38]);
  const [sessionId] = useState(() => createId());

  const activeChatIdRef = useRef<string>(activeChatId);

  const activeChat = useMemo(
    () => chatSessions.find((chat) => chat.id === activeChatId) ?? chatSessions[0] ?? seedChat,
    [activeChatId, chatSessions, seedChat],
  );

  useEffect(() => {
    activeChatIdRef.current = activeChat.id;
  }, [activeChat.id]);

  // Restore session from localStorage on mount
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const restored = loadSession();
    if (restored && restored.chats.length > 0) {
      const restoredChats: ChatSessionState[] = restored.chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: chat.messages,
        scene: chat.scene,
        semanticScene: chat.semanticScene ?? [],
        plannerMeta: chat.plannerMeta ?? [],
        batches: buildRestoreBatch(chat.id, chat.scene),
        warnings: [],
      }));

      setChatSessions(restoredChats);
      setPanelSizes(restored.prefs.panelSizes);

      const activeExists = restoredChats.some((chat) => chat.id === restored.activeChatId);
      setActiveChatId(activeExists ? restored.activeChatId : restoredChats[0]!.id);
    }

    setDidRestoreSession(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Debounced persistence
  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!didRestoreSession) return;
    if (persistTimeout.current) clearTimeout(persistTimeout.current);

    persistTimeout.current = setTimeout(() => {
      if (chatSessions.length === 0) return;
      saveSession({
        version: 3,
        updatedAt: Date.now(),
        activeChatId: activeChat.id,
        chats: chatSessions.map((chat) => ({
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          messages: chat.messages,
          scene: chat.scene,
          semanticScene: chat.semanticScene,
          plannerMeta: chat.plannerMeta,
        })),
        prefs: { panelSizes },
      });
    }, 500);

    return () => {
      if (persistTimeout.current) clearTimeout(persistTimeout.current);
    };
  }, [activeChat.id, chatSessions, didRestoreSession, panelSizes]);

  // Cleanup persist timeout on unmount
  useEffect(() => {
    return () => {
      if (persistTimeout.current) clearTimeout(persistTimeout.current);
    };
  }, []);

  const createChat = useCallback(() => {
    const nextChat = createEmptyChatSession(chatSessions.length + 1);
    setChatSessions((prev) => [nextChat, ...prev]);
    setActiveChatId(nextChat.id);
  }, [chatSessions.length]);

  const selectChat = useCallback(
    (chatId: string, opts?: { cancel?: () => void; resetStreamState?: () => void; streamChatId?: string | null }) => {
      if (chatId === activeChatId) return;
      // Abort active stream when switching away from the streaming chat
      if (opts?.streamChatId === activeChatId) {
        opts.cancel?.();
        opts.resetStreamState?.();
      }
      setActiveChatId(chatId);
    },
    [activeChatId],
  );

  const deleteChat = useCallback(
    (chatId: string, opts?: { cancel?: () => void; resetStreamState?: () => void; streamChatId?: string | null }) => {
      let nextActiveId: string | null = null;
      setChatSessions((prev) => {
        const index = prev.findIndex((chat) => chat.id === chatId);
        if (index === -1) return prev;

        if (prev.length === 1) {
          const replacement = createEmptyChatSession(1);
          nextActiveId = replacement.id;
          return [replacement];
        }

        const remaining = prev.filter((chat) => chat.id !== chatId);
        if (activeChatIdRef.current === chatId) {
          nextActiveId = remaining[Math.max(0, index - 1)]?.id ?? remaining[0]!.id;
        }
        return remaining;
      });

      if (opts?.streamChatId === chatId) {
        opts.cancel?.();
        opts.resetStreamState?.();
      }

      if (nextActiveId) {
        setActiveChatId(nextActiveId);
      }
    },
    [],
  );

  return useMemo(
    () => ({
      chatSessions,
      setChatSessions,
      activeChatId,
      activeChat,
      activeChatIdRef,
      didRestoreSession,
      sessionId,
      createChat,
      selectChat,
      deleteChat,
      panelSizes,
      setPanelSizes,
    }),
    [chatSessions, activeChatId, activeChat, didRestoreSession, sessionId, createChat, selectChat, deleteChat, panelSizes],
  );
}
