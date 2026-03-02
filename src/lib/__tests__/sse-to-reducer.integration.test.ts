import { describe, it, expect } from 'vitest';
import { parseSSEBuffer } from '@/hooks/sse-parser';
import type { AgentSSEEvent } from '@/types/agent';

/**
 * Lightweight runtime check that a parsed value matches one of the
 * AgentSSEEvent discriminated-union shapes.
 */
const VALID_SSE_TYPES = new Set([
  'assistant.text.delta',
  'assistant.text.done',
  'whiteboard.batch',
  'whiteboard.layout.diagnostics',
  'warning',
  'error',
  'turn.done',
]);

function isValidAgentSSEEvent(value: unknown): value is AgentSSEEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.type !== 'string') return false;
  if (!VALID_SSE_TYPES.has(obj.type)) return false;
  if (typeof obj.turnId !== 'string') return false;
  return true;
}

describe('SSE parse → validate integration', () => {
  it('raw SSE with valid events parses and validates through pipeline', () => {
    const raw =
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"Hello"}\n\n' +
      'data: {"type":"assistant.text.done","turnId":"t1","messageId":"m1"}\n\n' +
      'data: {"type":"turn.done","turnId":"t1","usage":{"prompt":10,"completion":5,"total":15}}\n\n';

    const { events, errors, remaining } = parseSSEBuffer(raw);

    expect(errors).toHaveLength(0);
    expect(remaining).toBe('');
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(isValidAgentSSEEvent(event)).toBe(true);
    }
  });

  it('malformed SSE data line produces parse error without crashing downstream', () => {
    const raw =
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"ok"}\n\n' +
      'data: {INVALID JSON}\n\n' +
      'data: {"type":"turn.done","turnId":"t1"}\n\n';

    const { events, errors } = parseSSEBuffer(raw);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Invalid SSE JSON');
    // valid events still parsed
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(isValidAgentSSEEvent(event)).toBe(true);
    }
  });

  it('multi-event SSE chunk preserves order through validation', () => {
    const raw =
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"A"}\n\n' +
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"B"}\n\n' +
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"C"}\n\n' +
      'data: {"type":"assistant.text.done","turnId":"t1","messageId":"m1"}\n\n' +
      'data: {"type":"whiteboard.batch","turnId":"t1","batch":{"batch_id":"b1","elements":[]}}\n\n' +
      'data: {"type":"turn.done","turnId":"t1"}\n\n';

    const { events, errors } = parseSSEBuffer(raw);

    expect(errors).toHaveLength(0);
    expect(events).toHaveLength(6);

    const types = events.map((e) => (e as AgentSSEEvent).type);
    expect(types).toEqual([
      'assistant.text.delta',
      'assistant.text.delta',
      'assistant.text.delta',
      'assistant.text.done',
      'whiteboard.batch',
      'turn.done',
    ]);

    // all valid
    for (const event of events) {
      expect(isValidAgentSSEEvent(event)).toBe(true);
    }
  });

  it('event with unknown type fails validation', () => {
    const raw = 'data: {"type":"unknown.event","turnId":"t1"}\n\n';
    const { events } = parseSSEBuffer(raw);

    expect(events).toHaveLength(1);
    expect(isValidAgentSSEEvent(events[0])).toBe(false);
  });

  it('event missing turnId fails validation', () => {
    const raw = 'data: {"type":"turn.done"}\n\n';
    const { events } = parseSSEBuffer(raw);

    expect(events).toHaveLength(1);
    expect(isValidAgentSSEEvent(events[0])).toBe(false);
  });
});
