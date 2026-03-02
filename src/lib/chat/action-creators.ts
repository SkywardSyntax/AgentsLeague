/**
 * Chat action creators — type-safe action creator functions with
 * runtime validation for chat state mutations.
 */

export interface SendMessageAction {
  type: 'SEND_MESSAGE';
  payload: { id: string; content: string; timestamp: number };
}

export interface ReceiveChunkAction {
  type: 'RECEIVE_CHUNK';
  payload: { messageId: string; chunk: string };
}

export interface CompleteResponseAction {
  type: 'COMPLETE_RESPONSE';
  payload: { messageId: string };
}

export interface SetErrorAction {
  type: 'SET_ERROR';
  payload: { message: string; code?: string };
}

export interface ClearChatAction {
  type: 'CLEAR_CHAT';
}

export interface RetryMessageAction {
  type: 'RETRY_MESSAGE';
  payload: { messageId: string };
}

export type ChatAction =
  | SendMessageAction
  | ReceiveChunkAction
  | CompleteResponseAction
  | SetErrorAction
  | ClearChatAction
  | RetryMessageAction;

export const CHAT_ACTION_TYPES = [
  'SEND_MESSAGE',
  'RECEIVE_CHUNK',
  'COMPLETE_RESPONSE',
  'SET_ERROR',
  'CLEAR_CHAT',
  'RETRY_MESSAGE',
] as const;

export function sendMessage(id: string, content: string): SendMessageAction {
  if (!content || content.trim().length === 0) {
    throw new Error('sendMessage: content must be a non-empty string');
  }
  return { type: 'SEND_MESSAGE', payload: { id, content: content.trim(), timestamp: Date.now() } };
}

export function receiveChunk(messageId: string, chunk: string): ReceiveChunkAction {
  if (typeof chunk !== 'string') {
    throw new Error('receiveChunk: chunk must be a string');
  }
  return { type: 'RECEIVE_CHUNK', payload: { messageId, chunk } };
}

export function completeResponse(messageId: string): CompleteResponseAction {
  return { type: 'COMPLETE_RESPONSE', payload: { messageId } };
}

export function setError(message: string, code?: string): SetErrorAction {
  return { type: 'SET_ERROR', payload: { message, code } };
}

export function clearChat(): ClearChatAction {
  return { type: 'CLEAR_CHAT' };
}

export function retryMessage(messageId: string): RetryMessageAction {
  return { type: 'RETRY_MESSAGE', payload: { messageId } };
}
