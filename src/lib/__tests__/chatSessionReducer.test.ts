import { describe, it, expect } from 'vitest';
import {
  chatSessionReducer,
  createEmptyChatSession,
  createInitialTurn,
  createMessage,
  type ChatStore,
  type ChatAction,
  type PendingDiagnosticsEntry,
} from '../state/chatSessionReducer';

function makeStore(overrides?: Partial<ChatStore>): ChatStore {
  const chat = createEmptyChatSession(1);
  return {
    chatOrder: [chat.id],
    chats: { [chat.id]: chat },
    turn: createInitialTurn(),
    ...overrides,
  };
}

function chatId(store: ChatStore): string {
  return store.chatOrder[0]!;
}

describe('chatSessionReducer', () => {
  describe('PUSH_WARNING', () => {
    it('appends a warning to the target chat', () => {
      const store = makeStore();
      const id = chatId(store);
      const next = chatSessionReducer(store, { type: 'PUSH_WARNING', chatId: id, warning: 'test warn' });
      expect(next.chats[id]!.warnings).toEqual(['test warn']);
    });

    it('deduplicates consecutive identical warnings', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'PUSH_WARNING', chatId: id, warning: 'dup' });
      s = chatSessionReducer(s, { type: 'PUSH_WARNING', chatId: id, warning: 'dup' });
      expect(s.chats[id]!.warnings).toEqual(['dup']);
    });

    it('caps warnings at 8', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = store;
      for (let i = 0; i < 10; i++) {
        s = chatSessionReducer(s, { type: 'PUSH_WARNING', chatId: id, warning: `w${i}` });
      }
      expect(s.chats[id]!.warnings).toHaveLength(8);
    });
  });

  describe('ADD_USER_MESSAGE', () => {
    it('appends the user message and updates title', () => {
      const store = makeStore();
      const id = chatId(store);
      const msg = createMessage('user', 'hello world');
      const next = chatSessionReducer(store, { type: 'ADD_USER_MESSAGE', chatId: id, message: msg, rawContent: 'hello world' });
      expect(next.chats[id]!.messages).toHaveLength(1);
      expect(next.chats[id]!.messages[0]!.content).toBe('hello world');
      expect(next.chats[id]!.title).toBe('hello world');
    });
  });

  describe('TURN_START', () => {
    it('sets status to thinking and stores streamChatId', () => {
      const store = makeStore();
      const id = chatId(store);
      const next = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      expect(next.turn.status).toBe('thinking');
      expect(next.turn.streamChatId).toBe(id);
      expect(next.turn.currentAssistantMessageId).toBeNull();
      expect(next.turn.turnHadRenderableOutput).toBe(false);
    });
  });

  describe('APPEND_ASSISTANT_DELTA', () => {
    it('creates a new assistant message on first delta', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'Hello' });
      expect(s.turn.status).toBe('streaming');
      expect(s.turn.turnHadRenderableOutput).toBe(true);
      expect(s.chats[id]!.messages).toHaveLength(1);
      expect(s.chats[id]!.messages[0]!.content).toBe('Hello');
      expect(s.turn.currentAssistantMessageId).toBe(s.chats[id]!.messages[0]!.id);
    });

    it('appends to existing message on subsequent deltas', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'Hello' });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: ' world' });
      expect(s.chats[id]!.messages).toHaveLength(1);
      expect(s.chats[id]!.messages[0]!.content).toBe('Hello world');
    });
  });

  describe('FINALIZE_ASSISTANT_MESSAGE', () => {
    it('clears currentAssistantMessageId', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'x' });
      expect(s.turn.currentAssistantMessageId).not.toBeNull();
      s = chatSessionReducer(s, { type: 'FINALIZE_ASSISTANT_MESSAGE' });
      expect(s.turn.currentAssistantMessageId).toBeNull();
    });
  });

  describe('TURN_DONE', () => {
    it('resets turn state to idle', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'hi' });
      s = chatSessionReducer(s, { type: 'TURN_DONE', chatId: id });
      expect(s.turn.status).toBe('idle');
      expect(s.turn.streamChatId).toBeNull();
      expect(s.turn.currentAssistantMessageId).toBeNull();
    });

    it('adds fallback message when no renderable output', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'TURN_DONE', chatId: id });
      expect(s.chats[id]!.messages).toHaveLength(1);
      expect(s.chats[id]!.messages[0]!.content).toContain('could not produce output');
    });
  });

  describe('TURN_ERROR', () => {
    it('adds error message and resets turn', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'TURN_ERROR', chatId: id, errorMessage: 'boom' });
      expect(s.turn.status).toBe('idle');
      expect(s.chats[id]!.messages).toHaveLength(1);
      expect(s.chats[id]!.messages[0]!.content).toBe('Error: boom');
    });

    it('removes partial assistant message on error after delta', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'partial...' });
      expect(s.chats[id]!.messages).toHaveLength(1);
      expect(s.turn.currentAssistantMessageId).not.toBeNull();
      s = chatSessionReducer(s, { type: 'TURN_ERROR', chatId: id, errorMessage: 'fail' });
      // Partial message removed, only error message remains
      expect(s.chats[id]!.messages).toHaveLength(1);
      expect(s.chats[id]!.messages[0]!.content).toBe('Error: fail');
      expect(s.turn.status).toBe('idle');
    });

    it('only adds error message when no delta was sent', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'TURN_ERROR', chatId: id, errorMessage: 'nope' });
      expect(s.chats[id]!.messages).toHaveLength(1);
      expect(s.chats[id]!.messages[0]!.content).toBe('Error: nope');
    });

    it('does not remove messages from a different chat', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
        turn: createInitialTurn(),
      };
      // Start turn on chat1, send delta
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: chat1.id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: chat1.id, delta: 'hello' });
      const partialMsgId = s.turn.currentAssistantMessageId!;
      expect(s.chats[chat1.id]!.messages).toHaveLength(1);
      // Error on chat2 should not remove chat1's partial message
      s = chatSessionReducer(s, { type: 'TURN_ERROR', chatId: chat2.id, errorMessage: 'wrong chat' });
      expect(s.chats[chat1.id]!.messages).toHaveLength(1);
      expect(s.chats[chat1.id]!.messages[0]!.id).toBe(partialMsgId);
      expect(s.chats[chat2.id]!.messages).toHaveLength(1);
      expect(s.chats[chat2.id]!.messages[0]!.content).toBe('Error: wrong chat');
    });
  });

  describe('STREAM_ERROR', () => {
    it('adds stream error message and resets turn', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'STREAM_ERROR', chatId: id, errorMessage: 'network' });
      expect(s.turn.status).toBe('idle');
      expect(s.chats[id]!.messages).toHaveLength(1);
      expect(s.chats[id]!.messages[0]!.content).toBe('Stream error: network');
    });
  });

  describe('CREATE_CHAT', () => {
    it('prepends new chat and resets turn', () => {
      const store = makeStore();
      const newChat = createEmptyChatSession(2);
      const next = chatSessionReducer(store, { type: 'CREATE_CHAT', chat: newChat });
      expect(next.chatOrder[0]).toBe(newChat.id);
      expect(next.chatOrder).toHaveLength(2);
      expect(next.chats[newChat.id]).toBeDefined();
      expect(next.turn.status).toBe('idle');
    });
  });

  describe('SELECT_CHAT', () => {
    it('resets turn state', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
        turn: { ...createInitialTurn(), status: 'streaming', streamChatId: chat1.id },
      };
      const next = chatSessionReducer(store, { type: 'SELECT_CHAT', chatId: chat2.id });
      expect(next.turn.status).toBe('idle');
      expect(next.turn.streamChatId).toBeNull();
    });

    it('lazily builds restore batch for unvisited chats with scene', () => {
      const chat = createEmptyChatSession(1);
      chat.scene = [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }];
      const store: ChatStore = {
        chatOrder: [chat.id],
        chats: { [chat.id]: chat },
        turn: createInitialTurn(),
      };
      const next = chatSessionReducer(store, { type: 'SELECT_CHAT', chatId: chat.id });
      expect(next.chats[chat.id]!.batches).toHaveLength(1);
      expect(next.chats[chat.id]!.batches[0]!.batch_id).toContain('restore-');
    });
  });

  describe('DELETE_CHAT', () => {
    it('removes chat and creates replacement when last chat', () => {
      const store = makeStore();
      const id = chatId(store);
      const next = chatSessionReducer(store, { type: 'DELETE_CHAT', chatId: id, activeChatId: id });
      expect(next.chatOrder).toHaveLength(1);
      expect(next.chatOrder[0]).not.toBe(id);
      expect(next.chats[id]).toBeUndefined();
    });

    it('removes chat from multi-chat store', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
        turn: createInitialTurn(),
      };
      const next = chatSessionReducer(store, { type: 'DELETE_CHAT', chatId: chat1.id, activeChatId: chat1.id });
      expect(next.chatOrder).toEqual([chat2.id]);
      expect(next.chats[chat1.id]).toBeUndefined();
    });
  });

  describe('CLEAR_CHAT', () => {
    it('clears messages, scene, and sets clear batch', () => {
      const store = makeStore();
      const id = chatId(store);
      // Add a message first
      const msg = createMessage('user', 'test');
      let s = chatSessionReducer(store, { type: 'ADD_USER_MESSAGE', chatId: id, message: msg, rawContent: 'test' });
      const clearBatch = { batch_id: 'clear-1', style_preset: 'clean_pen_sketch' as const, elements: [{ id: 'c1', type: 'clear' as const }] };
      s = chatSessionReducer(s, { type: 'CLEAR_CHAT', chatId: id, clearBatch });
      expect(s.chats[id]!.messages).toHaveLength(0);
      expect(s.chats[id]!.scene).toHaveLength(0);
      expect(s.chats[id]!.batches).toEqual([clearBatch]);
      expect(s.turn.status).toBe('idle');
    });
  });

  describe('DELETE_MESSAGE', () => {
    it('removes the specified message', () => {
      const store = makeStore();
      const id = chatId(store);
      const msg = createMessage('user', 'delete me');
      let s = chatSessionReducer(store, { type: 'ADD_USER_MESSAGE', chatId: id, message: msg, rawContent: 'delete me' });
      s = chatSessionReducer(s, { type: 'DELETE_MESSAGE', chatId: id, messageId: msg.id });
      expect(s.chats[id]!.messages).toHaveLength(0);
    });

    it('clears currentAssistantMessageId if it matches', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'hi' });
      const msgId = s.turn.currentAssistantMessageId!;
      s = chatSessionReducer(s, { type: 'DELETE_MESSAGE', chatId: id, messageId: msgId });
      expect(s.turn.currentAssistantMessageId).toBeNull();
    });
  });

  describe('RESTORE_SESSION', () => {
    it('replaces chats and chatOrder', () => {
      const store = makeStore();
      const newChat = createEmptyChatSession(1);
      const next = chatSessionReducer(store, {
        type: 'RESTORE_SESSION',
        chats: { [newChat.id]: newChat },
        chatOrder: [newChat.id],
      });
      expect(next.chatOrder).toEqual([newChat.id]);
      expect(Object.keys(next.chats)).toEqual([newChat.id]);
    });
  });

  describe('STORE_DIAGNOSTICS', () => {
    const entry: PendingDiagnosticsEntry = {
      batchId: 'b1',
      templateUsed: 'legacy_draw_batch',
      fallbackUsed: false,
      violationsFixed: [],
    };

    it('stores entry in turn pendingDiagnostics', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'STORE_DIAGNOSTICS', batchId: 'b1', entry });
      expect(s.turn.pendingDiagnostics['b1']).toEqual(entry);
    });

    it('is rejected when status is idle', () => {
      const store = makeStore();
      const next = chatSessionReducer(store, { type: 'STORE_DIAGNOSTICS', batchId: 'b1', entry });
      expect(next).toBe(store);
      expect(next.turn.pendingDiagnostics).toEqual({});
    });

    it('caps at 50 entries and resets with new entry', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      for (let i = 0; i < 52; i++) {
        s = chatSessionReducer(s, {
          type: 'STORE_DIAGNOSTICS',
          batchId: `b${i}`,
          entry: { ...entry, batchId: `b${i}` },
        });
      }
      // After 52nd insert (current had 51 entries > 50), cap triggers: only the 52nd entry remains
      expect(Object.keys(s.turn.pendingDiagnostics)).toHaveLength(1);
      expect(s.turn.pendingDiagnostics['b51']).toBeDefined();
    });
  });

  describe('APPLY_WHITEBOARD_BATCH with diagnostics lookup', () => {
    const diagEntry: PendingDiagnosticsEntry = {
      batchId: 'b1',
      templateUsed: 'legacy_draw_batch',
      fallbackUsed: true,
      violationsFixed: ['overlap'],
    };

    it('retrieves diagnostics from pendingDiagnostics and removes entry', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'STORE_DIAGNOSTICS', batchId: 'b1', entry: diagEntry });
      const batch = { batch_id: 'b1', elements: [{ id: 'r1', type: 'rect' as const, x: 0, y: 0, w: 10, h: 10 }] };
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch });
      expect(s.chats[id]!.plannerMeta).toHaveLength(1);
      expect(s.chats[id]!.plannerMeta[0]!.fallbackUsed).toBe(true);
      expect(s.turn.pendingDiagnostics['b1']).toBeUndefined();
    });

    it('computes firstToolBatch internally from turnSawToolBatch', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      // First non-provisional batch sets turnSawToolBatch to true
      const batch1 = { batch_id: 'tool-1', elements: [{ id: 'r1', type: 'rect' as const, x: 0, y: 0, w: 10, h: 10 }] };
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch: batch1 });
      expect(s.turn.turnSawToolBatch).toBe(true);
      // Provisional batch does not change turnSawToolBatch
      const batch2 = { batch_id: 'stream-provisional-1', elements: [{ id: 'r2', type: 'rect' as const, x: 20, y: 20, w: 10, h: 10 }] };
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch: batch2 });
      expect(s.turn.turnSawToolBatch).toBe(true);
    });

    it('appends batch elements to scene', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      const batch = { batch_id: 'b1', elements: [{ id: 'r1', type: 'rect' as const, x: 0, y: 0, w: 10, h: 10 }] };
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch });
      expect(s.chats[id]!.scene).toHaveLength(1);
      expect(s.chats[id]!.scene[0]!.id).toBe('r1');
      expect(s.chats[id]!.batches).toHaveLength(1);
      expect(s.turn.status).toBe('drawing');
    });

    it('handles clear element in batch', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      const batch1 = { batch_id: 'b1', elements: [{ id: 'r1', type: 'rect' as const, x: 0, y: 0, w: 10, h: 10 }] };
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch: batch1 });
      expect(s.chats[id]!.scene).toHaveLength(1);
      const batch2 = { batch_id: 'b2', elements: [{ id: 'c1', type: 'clear' as const }, { id: 'r2', type: 'rect' as const, x: 5, y: 5, w: 20, h: 20 }] };
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch: batch2 });
      expect(s.chats[id]!.scene).toHaveLength(1);
      expect(s.chats[id]!.scene[0]!.id).toBe('r2');
    });

    it('ignores duplicate batch_id (idempotency guard)', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      const batch = { batch_id: 'dup-1', elements: [{ id: 'r1', type: 'rect' as const, x: 0, y: 0, w: 10, h: 10 }] };
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch });
      expect(s.chats[id]!.scene).toHaveLength(1);
      expect(s.chats[id]!.batches).toHaveLength(1);
      // Apply same batch_id again — should be no-op
      const s2 = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch });
      expect(s2).toBe(s);
      expect(s2.chats[id]!.scene).toHaveLength(1);
      expect(s2.chats[id]!.batches).toHaveLength(1);
    });

    it('allows different batch_ids', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      const batch1 = { batch_id: 'a', elements: [{ id: 'r1', type: 'rect' as const, x: 0, y: 0, w: 10, h: 10 }] };
      const batch2 = { batch_id: 'b', elements: [{ id: 'r2', type: 'rect' as const, x: 5, y: 5, w: 10, h: 10 }] };
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch: batch1 });
      s = chatSessionReducer(s, { type: 'APPLY_WHITEBOARD_BATCH', chatId: id, batch: batch2 });
      expect(s.chats[id]!.scene).toHaveLength(2);
      expect(s.chats[id]!.batches).toHaveLength(2);
    });
  });

  describe('pendingDiagnostics cleared on turn boundaries', () => {
    const entry: PendingDiagnosticsEntry = {
      batchId: 'b1',
      templateUsed: 'legacy_draw_batch',
      fallbackUsed: false,
      violationsFixed: [],
    };

    it('TURN_START clears pendingDiagnostics', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'STORE_DIAGNOSTICS', batchId: 'b1', entry });
      expect(Object.keys(s.turn.pendingDiagnostics)).toHaveLength(1);
      // Starting a new turn clears them
      s = chatSessionReducer(s, { type: 'TURN_START', chatId: id });
      expect(s.turn.pendingDiagnostics).toEqual({});
    });

    it('TURN_DONE clears pendingDiagnostics', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'STORE_DIAGNOSTICS', batchId: 'b1', entry });
      s = chatSessionReducer(s, { type: 'TURN_DONE', chatId: id });
      expect(s.turn.pendingDiagnostics).toEqual({});
    });

    it('TURN_ERROR clears pendingDiagnostics', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'STORE_DIAGNOSTICS', batchId: 'b1', entry });
      s = chatSessionReducer(s, { type: 'TURN_ERROR', chatId: id, errorMessage: 'err' });
      expect(s.turn.pendingDiagnostics).toEqual({});
    });

    it('STREAM_ERROR clears pendingDiagnostics', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'STORE_DIAGNOSTICS', batchId: 'b1', entry });
      s = chatSessionReducer(s, { type: 'STREAM_ERROR', chatId: id, errorMessage: 'net' });
      expect(s.turn.pendingDiagnostics).toEqual({});
    });
  });

  describe('SELECT_CHAT guards', () => {
    it('SELECT_CHAT with unknown chatId is a no-op', () => {
      const store = makeStore();
      const next = chatSessionReducer(store, { type: 'SELECT_CHAT', chatId: 'nonexistent-id' });
      expect(next).toBe(store);
    });
  });

  describe('DELETE_CHAT guards', () => {
    it('DELETE_CHAT with chatId not in chatOrder is a no-op', () => {
      const store = makeStore();
      const next = chatSessionReducer(store, { type: 'DELETE_CHAT', chatId: 'nonexistent-id', activeChatId: chatId(store) });
      expect(next).toBe(store);
    });
  });

  describe('APPEND_ASSISTANT_DELTA immutability', () => {
    it('does not mutate the previous state turn object', () => {
      const store = makeStore();
      const id = chatId(store);
      const s1 = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      const turnBefore = s1.turn;
      const s2 = chatSessionReducer(s1, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'hello' });
      // s1.turn must be unchanged — no side-channel mutation
      expect(s1.turn).toBe(turnBefore);
      expect(s1.turn.currentAssistantMessageId).toBeNull();
      // s2 must have the new message ID
      expect(s2.turn.currentAssistantMessageId).not.toBeNull();
      expect(s2.turn).not.toBe(s1.turn);
    });

    it('returns state unchanged for unknown chatId', () => {
      const store = makeStore();
      const id = chatId(store);
      const s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      const next = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: 'nonexistent', delta: 'hi' });
      expect(next.chats).toBe(s.chats);
    });
  });

  describe('cross-chat state isolation', () => {
    it('APPEND_ASSISTANT_DELTA to chat A does not affect chat B messages', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
        turn: createInitialTurn(),
      };
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: chat1.id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: chat1.id, delta: 'hello from A' });
      expect(s.chats[chat1.id]!.messages).toHaveLength(1);
      expect(s.chats[chat2.id]!.messages).toHaveLength(0);
    });

    it('PUSH_WARNING to chat A does not affect chat B warnings', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
        turn: createInitialTurn(),
      };
      const s = chatSessionReducer(store, { type: 'PUSH_WARNING', chatId: chat1.id, warning: 'oops' });
      expect(s.chats[chat1.id]!.warnings).toEqual(['oops']);
      expect(s.chats[chat2.id]!.warnings).toEqual([]);
    });
  });

  describe('concurrent dispatch isolation', () => {
    it('dispatches to chat A do not cross-contaminate chat B', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
        turn: createInitialTurn(),
      };
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: chat1.id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: chat1.id, delta: 'hello from A' });
      const newChat = createEmptyChatSession(3);
      s = chatSessionReducer(s, { type: 'CREATE_CHAT', chat: newChat });
      expect(s.chats[newChat.id]!.messages).toHaveLength(0);
      expect(s.chats[chat1.id]!.messages).toHaveLength(1);
      expect(s.chats[chat1.id]!.messages[0]!.content).toBe('hello from A');
      expect(s.chats[chat2.id]!.messages).toHaveLength(0);
    });
  });

  describe('rapid chat switch during stream', () => {
    it('delta targets streamChatId, not the selected chat', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
        turn: createInitialTurn(),
      };
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: chat1.id });
      expect(s.turn.streamChatId).toBe(chat1.id);
      // Simulate selecting chat B while stream targets chat A
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: chat1.id, delta: 'streamed to A' });
      expect(s.chats[chat1.id]!.messages).toHaveLength(1);
      expect(s.chats[chat1.id]!.messages[0]!.content).toBe('streamed to A');
      expect(s.chats[chat2.id]!.messages).toHaveLength(0);
    });
  });

  describe('reference identity preservation', () => {
    it('chatOrder reference is unchanged on turn-only changes', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const chat3 = createEmptyChatSession(3);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id, chat3.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2, [chat3.id]: chat3 },
        turn: createInitialTurn(),
      };
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: chat1.id });
      const orderRef = s.chatOrder;
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: chat1.id, delta: 'hi' });
      expect(s.chatOrder).toBe(orderRef);
      s = chatSessionReducer(s, { type: 'TURN_DONE', chatId: chat1.id });
      expect(s.chatOrder).toBe(orderRef);
    });

    it('chats reference is preserved when only turn state changes via TURN_START', () => {
      const store = makeStore();
      const id = chatId(store);
      const chatsRef = store.chats;
      // TURN_START only modifies turn, not chats
      const s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      expect(s.chats).toBe(chatsRef);
    });

    it('chats reference changes when a chat is modified', () => {
      const store = makeStore();
      const id = chatId(store);
      const chatsRef = store.chats;
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: id });
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: id, delta: 'hello' });
      expect(s.chats).not.toBe(chatsRef);
    });

    it('unrelated chat references are preserved when another chat is modified', () => {
      const chat1 = createEmptyChatSession(1);
      const chat2 = createEmptyChatSession(2);
      const store: ChatStore = {
        chatOrder: [chat1.id, chat2.id],
        chats: { [chat1.id]: chat1, [chat2.id]: chat2 },
        turn: createInitialTurn(),
      };
      let s = chatSessionReducer(store, { type: 'TURN_START', chatId: chat1.id });
      const chat2Ref = s.chats[chat2.id];
      s = chatSessionReducer(s, { type: 'APPEND_ASSISTANT_DELTA', chatId: chat1.id, delta: 'delta' });
      expect(s.chats[chat2.id]).toBe(chat2Ref);
    });
  });

  describe('warnings eviction order', () => {
    it('evicts oldest warnings when exceeding cap of 8', () => {
      const store = makeStore();
      const id = chatId(store);
      let s = store;
      for (let i = 0; i < 9; i++) {
        s = chatSessionReducer(s, { type: 'PUSH_WARNING', chatId: id, warning: `w${i}` });
      }
      expect(s.chats[id]!.warnings).toHaveLength(8);
      // First warning (w0) should be evicted; oldest remaining is w1
      expect(s.chats[id]!.warnings[0]).toBe('w1');
      expect(s.chats[id]!.warnings[7]).toBe('w8');
    });
  });
});
