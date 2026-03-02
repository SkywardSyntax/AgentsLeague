import { describe, it, expect } from 'vitest';
import { isValidAgentSSEEvent } from '@/lib/client/event-validator';

describe('isValidAgentSSEEvent', () => {
  it('accepts valid assistant.text.delta', () => {
    expect(isValidAgentSSEEvent({ type: 'assistant.text.delta', turnId: 't1', delta: 'hello' })).toBe(true);
  });

  it('accepts valid assistant.text.done', () => {
    expect(isValidAgentSSEEvent({ type: 'assistant.text.done', turnId: 't1', messageId: 'm1' })).toBe(true);
  });

  it('accepts valid whiteboard.batch', () => {
    expect(isValidAgentSSEEvent({ type: 'whiteboard.batch', turnId: 't1', batch: { elements: [] } })).toBe(true);
  });

  it('accepts valid whiteboard.layout.diagnostics', () => {
    expect(isValidAgentSSEEvent({
      type: 'whiteboard.layout.diagnostics',
      turnId: 't1',
      batchId: 'b1',
      violationsFixed: [],
      templateUsed: 'legacy_draw_batch',
      fallbackUsed: false,
    })).toBe(true);
  });

  it('accepts valid warning', () => {
    expect(isValidAgentSSEEvent({ type: 'warning', turnId: 't1', code: 'W1', message: 'msg' })).toBe(true);
  });

  it('accepts valid error', () => {
    expect(isValidAgentSSEEvent({
      type: 'error', turnId: 't1', code: 'E1', message: 'fail', retryable: true,
    })).toBe(true);
  });

  it('accepts valid turn.done', () => {
    expect(isValidAgentSSEEvent({ type: 'turn.done', turnId: 't1' })).toBe(true);
  });

  it('accepts turn.done with optional usage', () => {
    expect(isValidAgentSSEEvent({ type: 'turn.done', turnId: 't1', usage: { total: 42 } })).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidAgentSSEEvent(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isValidAgentSSEEvent('hello')).toBe(false);
  });

  it('rejects unknown event type', () => {
    expect(isValidAgentSSEEvent({ type: 'unknown.type', turnId: 't1' })).toBe(false);
  });

  it('rejects missing turnId', () => {
    expect(isValidAgentSSEEvent({ type: 'turn.done' })).toBe(false);
  });

  it('rejects text.delta without delta field', () => {
    expect(isValidAgentSSEEvent({ type: 'assistant.text.delta', turnId: 't1' })).toBe(false);
  });

  it('rejects text.done without messageId', () => {
    expect(isValidAgentSSEEvent({ type: 'assistant.text.done', turnId: 't1' })).toBe(false);
  });

  it('rejects error without retryable boolean', () => {
    expect(isValidAgentSSEEvent({
      type: 'error', turnId: 't1', code: 'E1', message: 'fail',
    })).toBe(false);
  });

  it('rejects whiteboard.batch without batch object', () => {
    expect(isValidAgentSSEEvent({ type: 'whiteboard.batch', turnId: 't1' })).toBe(false);
  });

  it('rejects diagnostics without violationsFixed array', () => {
    expect(isValidAgentSSEEvent({
      type: 'whiteboard.layout.diagnostics', turnId: 't1', batchId: 'b1',
    })).toBe(false);
  });
});

// Circuit breaker behavior is tested via the parse loop in useAgentStream.
// Here we add a focused integration-style test using the validator.
describe('circuit breaker pattern', () => {
  it('detects 5 consecutive malformed events', () => {
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;
    const malformedEvents = [
      '{"bad": true}',
      '{"type": "unknown"}',
      'not json at all',
      '{"type": "error"}',  // missing turnId, code, message, retryable
      '42',
    ];

    let aborted = false;
    for (const raw of malformedEvents) {
      try {
        const parsed = JSON.parse(raw);
        if (!isValidAgentSSEEvent(parsed)) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
        }
      } catch {
        consecutiveFailures++;
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        aborted = true;
        break;
      }
    }
    expect(aborted).toBe(true);
    expect(consecutiveFailures).toBe(5);
  });

  it('resets counter on valid event', () => {
    let consecutiveFailures = 0;
    const events = [
      '{"bad": true}',
      '{"type": "turn.done", "turnId": "t1"}',
      '{"bad": true}',
    ];

    for (const raw of events) {
      try {
        const parsed = JSON.parse(raw);
        if (!isValidAgentSSEEvent(parsed)) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
        }
      } catch {
        consecutiveFailures++;
      }
    }
    expect(consecutiveFailures).toBe(1);
  });
});
