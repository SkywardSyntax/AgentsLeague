import { describe, it, expect } from 'vitest';
import {
  sendMessage,
  receiveChunk,
  completeResponse,
  setError,
  clearChat,
  retryMessage,
  CHAT_ACTION_TYPES,
} from '../action-creators';

describe('Lane 03 — Chat Action Creators', () => {
  it('sendMessage() creates action with type SEND_MESSAGE', () => {
    const action = sendMessage('m1', 'hello');
    expect(action.type).toBe('SEND_MESSAGE');
    expect(action.payload.content).toBe('hello');
  });

  it('sendMessage() validates non-empty content', () => {
    expect(() => sendMessage('m1', '')).toThrow();
    expect(() => sendMessage('m1', '   ')).toThrow();
  });

  it('receiveChunk() creates action with type RECEIVE_CHUNK', () => {
    const action = receiveChunk('m1', 'partial');
    expect(action.type).toBe('RECEIVE_CHUNK');
    expect(action.payload.chunk).toBe('partial');
  });

  it('receiveChunk() validates chunk is a string', () => {
    // @ts-expect-error testing runtime validation
    expect(() => receiveChunk('m1', 42)).toThrow();
  });

  it('completeResponse() creates action with type COMPLETE_RESPONSE', () => {
    const action = completeResponse('m1');
    expect(action.type).toBe('COMPLETE_RESPONSE');
    expect(action.payload.messageId).toBe('m1');
  });

  it('setError() creates action with type SET_ERROR', () => {
    const action = setError('something broke');
    expect(action.type).toBe('SET_ERROR');
    expect(action.payload.message).toBe('something broke');
  });

  it('setError() includes error message and optional code', () => {
    const action = setError('timeout', 'E_TIMEOUT');
    expect(action.payload.code).toBe('E_TIMEOUT');
    const action2 = setError('generic');
    expect(action2.payload.code).toBeUndefined();
  });

  it('clearChat() creates action with type CLEAR_CHAT', () => {
    const action = clearChat();
    expect(action.type).toBe('CLEAR_CHAT');
  });

  it('retryMessage() creates action with type RETRY_MESSAGE', () => {
    const action = retryMessage('m2');
    expect(action.type).toBe('RETRY_MESSAGE');
    expect(action.payload.messageId).toBe('m2');
  });

  it('all action types are unique strings', () => {
    expect(new Set(CHAT_ACTION_TYPES).size).toBe(CHAT_ACTION_TYPES.length);
    for (const t of CHAT_ACTION_TYPES) {
      expect(typeof t).toBe('string');
    }
  });
});
