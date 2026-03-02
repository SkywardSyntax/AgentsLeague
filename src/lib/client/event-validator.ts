import type { AgentSSEEvent } from '@/types/agent';

const VALID_EVENT_TYPES = new Set([
  'assistant.text.delta',
  'assistant.text.done',
  'whiteboard.batch',
  'whiteboard.layout.diagnostics',
  'warning',
  'error',
  'turn.done',
]);

/**
 * Type guard that validates an unknown parsed value is a well-formed AgentSSEEvent.
 * Checks for correct `type` discriminant and required fields per variant.
 */
export function isValidAgentSSEEvent(data: unknown): data is AgentSSEEvent {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.type !== 'string' || !VALID_EVENT_TYPES.has(obj.type)) return false;
  if (typeof obj.turnId !== 'string') return false;

  switch (obj.type) {
    case 'assistant.text.delta':
      return typeof obj.delta === 'string';
    case 'assistant.text.done':
      return typeof obj.messageId === 'string';
    case 'whiteboard.batch':
      return obj.batch != null && typeof obj.batch === 'object';
    case 'whiteboard.layout.diagnostics':
      return typeof obj.batchId === 'string' && Array.isArray(obj.violationsFixed);
    case 'warning':
      return typeof obj.code === 'string' && typeof obj.message === 'string';
    case 'error':
      return (
        typeof obj.code === 'string' &&
        typeof obj.message === 'string' &&
        typeof obj.retryable === 'boolean'
      );
    case 'turn.done':
      return true;
    default:
      return false;
  }
}
