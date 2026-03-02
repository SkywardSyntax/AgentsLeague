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

/** Check that each required field exists on obj with the expected typeof. */
function validateEventFields(
  obj: Record<string, unknown>,
  required: Record<string, string>,
): boolean {
  for (const [key, expectedType] of Object.entries(required)) {
    if (expectedType === 'array') {
      if (!Array.isArray(obj[key])) return false;
    } else if (typeof obj[key] !== expectedType) {
      return false;
    }
  }
  return true;
}

/**
 * Type guard that validates an unknown parsed value is a well-formed AgentSSEEvent.
 * Checks for correct `type` discriminant and required fields per variant.
 * Extra unknown fields are allowed for forward-compatibility.
 */
export function isValidAgentSSEEvent(data: unknown): data is AgentSSEEvent {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.type !== 'string' || !VALID_EVENT_TYPES.has(obj.type)) return false;
  if (typeof obj.turnId !== 'string') return false;

  switch (obj.type) {
    case 'assistant.text.delta':
      return validateEventFields(obj, { delta: 'string' });
    case 'assistant.text.done':
      return validateEventFields(obj, { messageId: 'string' });
    case 'whiteboard.batch': {
      if (obj.batch == null || typeof obj.batch !== 'object' || Array.isArray(obj.batch)) return false;
      const batch = obj.batch as Record<string, unknown>;
      if (!validateEventFields(batch, { batch_id: 'string' })) return false;
      if (!Array.isArray(batch.elements)) return false;
      for (const el of batch.elements) {
        if (el == null || typeof el !== 'object' || Array.isArray(el)) return false;
        const elem = el as Record<string, unknown>;
        if (!validateEventFields(elem, { id: 'string', type: 'string' })) return false;
      }
      return true;
    }
    case 'whiteboard.layout.diagnostics':
      return validateEventFields(obj, {
        batchId: 'string',
        templateUsed: 'string',
        fallbackUsed: 'boolean',
      }) && Array.isArray(obj.violationsFixed);
    case 'warning':
      return validateEventFields(obj, { code: 'string', message: 'string' });
    case 'error':
      return validateEventFields(obj, {
        code: 'string',
        message: 'string',
        retryable: 'boolean',
      });
    case 'turn.done':
      return true;
    default:
      return false;
  }
}
