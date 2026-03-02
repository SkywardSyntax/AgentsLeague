import { describe, it, expect } from 'vitest';
import { validateSSEEvent } from '../validate-sse-event';

describe('SSE Event Validation', () => {
  it('valid text.delta event passes', () => {
    const result = validateSSEEvent({ type: 'assistant.text.delta', delta: 'hello' });
    expect(result.valid).toBe(true);
    expect(result.event).toBeTruthy();
    expect(result.event!.type).toBe('assistant.text.delta');
  });

  it('text.delta without delta field is rejected', () => {
    const result = validateSSEEvent({ type: 'assistant.text.delta' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('delta');
  });

  it('text.delta with non-string delta is rejected', () => {
    const result = validateSSEEvent({ type: 'assistant.text.delta', delta: 42 });
    expect(result.valid).toBe(false);
  });

  it('whiteboard.batch with valid batch passes', () => {
    const result = validateSSEEvent({
      type: 'whiteboard.batch',
      batch: { batch_id: 'b1', elements: [] },
    });
    expect(result.valid).toBe(true);
  });

  it('whiteboard.batch without batch object is rejected', () => {
    const result = validateSSEEvent({ type: 'whiteboard.batch' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('batch');
  });

  it('whiteboard.batch with missing elements array is rejected', () => {
    const result = validateSSEEvent({
      type: 'whiteboard.batch',
      batch: { batch_id: 'b1' },
    });
    expect(result.valid).toBe(false);
  });

  it('error event without message is rejected', () => {
    const result = validateSSEEvent({ type: 'error' });
    expect(result.valid).toBe(false);
  });

  it('null input is rejected', () => {
    const result = validateSSEEvent(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Event is not an object');
  });

  it('event with empty type string is rejected', () => {
    const result = validateSSEEvent({ type: '' });
    expect(result.valid).toBe(false);
  });

  it('unknown event type passes through (forward compatibility)', () => {
    const result = validateSSEEvent({ type: 'future.new.event', data: 123 });
    expect(result.valid).toBe(true);
  });
});
