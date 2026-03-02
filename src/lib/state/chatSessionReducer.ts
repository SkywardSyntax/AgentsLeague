import type {
  ChatMessage,
  DrawBatch,
  DrawElement,
  SemanticBatch,
  WhiteboardLayoutDiagnostics,
} from '@/types/agent';
import {
  removeStreamOverlayFromBatches,
  removeStreamOverlayFromScene,
} from '@/lib/whiteboard/stream-overlay';
import { fromLegacyDrawBatchToSemanticStub } from '@/lib/whiteboard/planner';
import { type AppStatus, transitionStatus } from './statusMachine';

// ── Types ──────────────────────────────────────────────────────────────

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

export interface PendingDiagnosticsEntry {
  batchId: string;
  templateUsed: WhiteboardLayoutDiagnostics['templateUsed'];
  fallbackUsed: boolean;
  violationsFixed: string[];
  semanticBatch?: SemanticBatch;
}

export interface TurnState {
  status: AppStatus;
  currentAssistantMessageId: string | null;
  turnHadRenderableOutput: boolean;
  turnSawToolBatch: boolean;
  streamChatId: string | null;
  pendingDiagnostics: Record<string, PendingDiagnosticsEntry>;
}

export interface ChatStore {
  chatOrder: string[];
  chats: Record<string, ChatSessionState>;
  turn: TurnState;
}

// ── Helpers ────────────────────────────────────────────────────────────

export function updateChat(
  store: ChatStore,
  chatId: string,
  updater: (chat: ChatSessionState) => ChatSessionState,
): ChatStore {
  const chat = store.chats[chatId];
  if (!chat) return store;
  const updated = updater(chat);
  if (updated === chat) return store;
  return { ...store, chats: { ...store.chats, [chatId]: updated } };
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: createId(), role, content, createdAt: Date.now() };
}

function defaultChatTitle(index: number): string {
  return `Chat ${index}`;
}

export function looksDefaultTitle(title: string): boolean {
  return /^Chat \d+$/.test(title.trim());
}

export function buildChatTitleFromMessage(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New Chat';
  return normalized.length > 40 ? `${normalized.slice(0, 40)}…` : normalized;
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

export function withoutStreamOverlay(chat: ChatSessionState): ChatSessionState {
  const nextScene = removeStreamOverlayFromScene(chat.scene);
  const nextBatches = removeStreamOverlayFromBatches(chat.batches);
  if (nextScene === chat.scene && nextBatches === chat.batches) return chat;
  return { ...chat, scene: nextScene, batches: nextBatches };
}

export function buildRestoreBatch(chatId: string, scene: DrawElement[]): DrawBatch[] {
  if (scene.length === 0) return [];
  return [
    {
      batch_id: `restore-${chatId}-${Date.now()}`,
      style_preset: 'clean_pen_sketch',
      elements: scene,
    },
  ];
}

const IDLE_TURN: TurnState = {
  status: 'idle',
  currentAssistantMessageId: null,
  turnHadRenderableOutput: false,
  turnSawToolBatch: false,
  streamChatId: null,
  pendingDiagnostics: {},
};

export function createInitialTurn(): TurnState {
  return { ...IDLE_TURN };
}

// ── Actions ────────────────────────────────────────────────────────────

export type ChatAction =
  | { type: 'RESTORE_SESSION'; chats: Record<string, ChatSessionState>; chatOrder: string[] }
  | { type: 'PUSH_WARNING'; chatId: string; warning: string }
  | { type: 'APPEND_ASSISTANT_DELTA'; chatId: string; delta: string }
  | { type: 'FINALIZE_ASSISTANT_MESSAGE' }
  | { type: 'APPLY_WHITEBOARD_BATCH'; chatId: string; batch: DrawBatch }
  | { type: 'STORE_DIAGNOSTICS'; batchId: string; entry: PendingDiagnosticsEntry }
  | { type: 'TURN_START'; chatId: string }
  | { type: 'TURN_ERROR'; chatId: string; errorMessage: string }
  | { type: 'TURN_DONE'; chatId: string }
  | { type: 'STREAM_ERROR'; chatId: string; errorMessage: string }
  | { type: 'ADD_USER_MESSAGE'; chatId: string; message: ChatMessage; rawContent: string }
  | { type: 'CREATE_CHAT'; chat: ChatSessionState }
  | { type: 'SELECT_CHAT'; chatId: string }
  | { type: 'DELETE_CHAT'; chatId: string; activeChatId: string }
  | { type: 'CLEAR_CHAT'; chatId: string; clearBatch: DrawBatch }
  | { type: 'DELETE_MESSAGE'; chatId: string; messageId: string };

// ── Reducer ────────────────────────────────────────────────────────────

export function chatSessionReducer(state: ChatStore, action: ChatAction): ChatStore {
  switch (action.type) {
    case 'RESTORE_SESSION':
      return { ...state, chats: action.chats, chatOrder: action.chatOrder };

    case 'PUSH_WARNING': {
      return updateChat(state, action.chatId, (chat) => {
        if (chat.warnings[chat.warnings.length - 1] === action.warning) return chat;
        return {
          ...chat,
          updatedAt: Date.now(),
          warnings: [...chat.warnings, action.warning].slice(-8),
        };
      });
    }

    case 'APPEND_ASSISTANT_DELTA': {
      const nextStatus = transitionStatus(state.turn.status, 'streaming');
      const currentMsgId = state.turn.currentAssistantMessageId;
      const chat = state.chats[action.chatId];
      if (!chat) return state;

      const baseTurn = {
        ...state.turn,
        status: nextStatus,
        turnHadRenderableOutput: true,
      };

      if (!currentMsgId || !chat.messages.some((msg) => msg.id === currentMsgId)) {
        const nextMsg = createMessage('assistant', action.delta);
        return {
          ...state,
          turn: { ...baseTurn, currentAssistantMessageId: nextMsg.id },
          chats: {
            ...state.chats,
            [action.chatId]: {
              ...chat,
              updatedAt: Date.now(),
              messages: [...chat.messages, nextMsg],
            },
          },
        };
      }

      return {
        ...state,
        turn: baseTurn,
        chats: {
          ...state.chats,
          [action.chatId]: {
            ...chat,
            updatedAt: Date.now(),
            messages: chat.messages.map((msg) =>
              msg.id === currentMsgId ? { ...msg, content: `${msg.content}${action.delta}` } : msg,
            ),
          },
        },
      };
    }

    case 'FINALIZE_ASSISTANT_MESSAGE':
      return { ...state, turn: { ...state.turn, currentAssistantMessageId: null } };

    case 'APPLY_WHITEBOARD_BATCH': {
      // Idempotency guard: skip if this batch_id was already applied
      const targetChat = state.chats[action.chatId];
      if (targetChat && targetChat.batches.some((b) => b.batch_id === action.batch.batch_id)) {
        return state;
      }

      const nextStatus = transitionStatus(state.turn.status, 'drawing');
      const isProvisional = action.batch.batch_id.startsWith('stream-provisional-');
      const firstToolBatch = !isProvisional && !state.turn.turnSawToolBatch;
      const diagnostics = state.turn.pendingDiagnostics[action.batch.batch_id];
      const { [action.batch.batch_id]: _, ...remainingDiagnostics } = state.turn.pendingDiagnostics;
      const nextTurn: TurnState = {
        ...state.turn,
        status: nextStatus,
        turnHadRenderableOutput: true,
        turnSawToolBatch: isProvisional ? state.turn.turnSawToolBatch : true,
        pendingDiagnostics: remainingDiagnostics,
      };
      const base: ChatStore = { ...state, turn: nextTurn };

      return updateChat(base, action.chatId, (chat) => {
        const baseChat = firstToolBatch ? withoutStreamOverlay(chat) : chat;
        const hasClear = action.batch.elements.some((el) => el.type === 'clear');
        const baseScene = hasClear ? [] : [...baseChat.scene];
        action.batch.elements.forEach((element) => {
          if (element.type !== 'clear') baseScene.push(element);
        });

        const nextPlannerMeta =
          diagnostics != null
            ? [
                ...baseChat.plannerMeta,
                {
                  batchId: diagnostics.batchId,
                  templateUsed: diagnostics.templateUsed,
                  fallbackUsed: diagnostics.fallbackUsed,
                  violationsFixed: diagnostics.violationsFixed,
                },
              ].slice(-40)
            : baseChat.plannerMeta;

        const semanticBatch =
          diagnostics?.semanticBatch ??
          fromLegacyDrawBatchToSemanticStub(action.batch.batch_id, action.batch.elements);
        const nextSemanticScene = [...baseChat.semanticScene, semanticBatch].slice(-80);
        return {
          ...baseChat,
          updatedAt: Date.now(),
          scene: baseScene,
          semanticScene: nextSemanticScene,
          plannerMeta: nextPlannerMeta,
          batches: [...baseChat.batches, action.batch],
        };
      });
    }

    case 'TURN_START':
      return {
        ...state,
        turn: {
          status: transitionStatus(state.turn.status, 'thinking'),
          currentAssistantMessageId: null,
          turnHadRenderableOutput: false,
          turnSawToolBatch: false,
          streamChatId: action.chatId,
          pendingDiagnostics: {},
        },
      };

    case 'TURN_ERROR': {
      const partialId = state.turn.currentAssistantMessageId;
      const next: ChatStore = {
        ...state,
        turn: { ...IDLE_TURN },
      };
      return updateChat(next, action.chatId, (chat) => {
        // Remove partial assistant message if it belongs to this chat
        const filtered =
          partialId && chat.messages.some((m) => m.id === partialId)
            ? chat.messages.filter((m) => m.id !== partialId)
            : chat.messages;
        return {
          ...chat,
          updatedAt: Date.now(),
          messages: [...filtered, createMessage('assistant', `Error: ${action.errorMessage}`)],
        };
      });
    }

    case 'TURN_DONE': {
      const hadOutput = state.turn.turnHadRenderableOutput;
      const next: ChatStore = {
        ...state,
        turn: { ...IDLE_TURN },
      };
      if (hadOutput) return next;
      return updateChat(next, action.chatId, (chat) => ({
        ...chat,
        updatedAt: Date.now(),
        messages: [
          ...chat.messages,
          createMessage('assistant', 'I could not produce output for that turn. Please try again.'),
        ],
      }));
    }

    case 'STREAM_ERROR': {
      return updateChat(
        { ...state, turn: { ...IDLE_TURN, turnHadRenderableOutput: true } },
        action.chatId,
        (chat) => ({
          ...chat,
          updatedAt: Date.now(),
          messages: [...chat.messages, createMessage('assistant', `Stream error: ${action.errorMessage}`)],
        }),
      );
    }

    case 'ADD_USER_MESSAGE': {
      return updateChat(state, action.chatId, (chat) => {
        const nextTitle =
          chat.messages.length === 0 || looksDefaultTitle(chat.title)
            ? buildChatTitleFromMessage(action.rawContent)
            : chat.title;
        return {
          ...chat,
          updatedAt: Date.now(),
          title: nextTitle,
          messages: [...chat.messages, action.message],
        };
      });
    }

    case 'CREATE_CHAT':
      return {
        ...state,
        chatOrder: [action.chat.id, ...state.chatOrder],
        chats: { ...state.chats, [action.chat.id]: action.chat },
        turn: { ...IDLE_TURN },
      };

    case 'SELECT_CHAT': {
      const chat = state.chats[action.chatId];
      if (!chat) return state;
      const base: ChatStore = { ...state, turn: { ...IDLE_TURN } };
      if (chat.batches.length === 0 && chat.scene.length > 0) {
        return updateChat(base, action.chatId, (c) => ({
          ...c,
          batches: buildRestoreBatch(action.chatId, c.scene),
        }));
      }
      return base;
    }

    case 'DELETE_CHAT': {
      const index = state.chatOrder.indexOf(action.chatId);
      if (index === -1) return state;

      if (state.chatOrder.length === 1) {
        const replacement = createEmptyChatSession(1);
        return {
          ...state,
          chatOrder: [replacement.id],
          chats: { [replacement.id]: replacement },
          turn: state.turn.streamChatId === action.chatId ? { ...IDLE_TURN } : state.turn,
        };
      }

      const nextOrder = state.chatOrder.filter((id) => id !== action.chatId);
      const { [action.chatId]: _, ...remainingChats } = state.chats;
      return {
        ...state,
        chatOrder: nextOrder,
        chats: remainingChats,
        turn: state.turn.streamChatId === action.chatId ? { ...IDLE_TURN } : state.turn,
      };
    }

    case 'CLEAR_CHAT':
      return {
        ...updateChat(state, action.chatId, (chat) => ({
          ...chat,
          updatedAt: Date.now(),
          messages: [],
          scene: [],
          semanticScene: [],
          plannerMeta: [],
          warnings: [],
          batches: [action.clearBatch],
        })),
        turn: { ...IDLE_TURN },
      };

    case 'DELETE_MESSAGE': {
      const nextTurn =
        state.turn.currentAssistantMessageId === action.messageId
          ? { ...state.turn, currentAssistantMessageId: null }
          : state.turn;
      return updateChat({ ...state, turn: nextTurn }, action.chatId, (chat) => ({
        ...chat,
        updatedAt: Date.now(),
        messages: chat.messages.filter((m) => m.id !== action.messageId),
      }));
    }

    case 'STORE_DIAGNOSTICS': {
      if (state.turn.status === 'idle') return state;
      const current = state.turn.pendingDiagnostics;
      if (Object.keys(current).length > 50) {
        console.warn('[chatSessionReducer] pendingDiagnostics cap reached, clearing');
        return { ...state, turn: { ...state.turn, pendingDiagnostics: { [action.batchId]: action.entry } } };
      }
      return { ...state, turn: { ...state.turn, pendingDiagnostics: { ...current, [action.batchId]: action.entry } } };
    }

    default:
      return state;
  }
}
