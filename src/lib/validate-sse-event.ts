import type { AgentSSEEvent } from '@/types/agent';

export interface ValidationResult {
  valid: boolean;
  event: AgentSSEEvent | null;
  error?: string;
}

export function validateSSEEvent(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, event: null, error: 'Event is not an object' };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== 'string' || obj.type.length === 0) {
    return { valid: false, event: null, error: 'Event missing "type" field' };
  }

  switch (obj.type) {
    case 'assistant.text.delta':
      if (typeof obj.delta !== 'string') {
        return { valid: false, event: null, error: 'text.delta event missing "delta" string' };
      }
      return { valid: true, event: obj as AgentSSEEvent };

    case 'assistant.text.done':
      return { valid: true, event: obj as AgentSSEEvent };

    case 'whiteboard.batch':
      if (!obj.batch || typeof obj.batch !== 'object') {
        return { valid: false, event: null, error: 'whiteboard.batch event missing "batch" object' };
      }
      {
        const batch = obj.batch as Record<string, unknown>;
        if (typeof batch.batch_id !== 'string') {
          return { valid: false, event: null, error: 'whiteboard.batch missing batch_id' };
        }
        if (!Array.isArray(batch.elements)) {
          return { valid: false, event: null, error: 'whiteboard.batch missing elements array' };
        }
      }
      return { valid: true, event: obj as AgentSSEEvent };

    case 'whiteboard.layout.diagnostics':
      if (typeof obj.batchId !== 'string') {
        return { valid: false, event: null, error: 'diagnostics event missing batchId' };
      }
      return { valid: true, event: obj as AgentSSEEvent };

    case 'error':
      if (typeof obj.message !== 'string') {
        return { valid: false, event: null, error: 'error event missing message string' };
      }
      return { valid: true, event: obj as AgentSSEEvent };

    case 'warning':
      if (typeof obj.message !== 'string') {
        return { valid: false, event: null, error: 'warning event missing message string' };
      }
      return { valid: true, event: obj as AgentSSEEvent };

    case 'turn.done':
      return { valid: true, event: obj as AgentSSEEvent };

    default:
      // Unknown event types pass through — forward compatibility
      return { valid: true, event: obj as AgentSSEEvent };
  }
}
