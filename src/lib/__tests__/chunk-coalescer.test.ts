import { describe, expect, it, vi } from 'vitest';
import { createChunkCoalescer } from '@/lib/server/chunk-coalescer';

describe('chunk-coalescer', () => {
  it('createChunkCoalescer returns object with push, flush, onFlush methods', () => {
    const coalescer = createChunkCoalescer();
    expect(typeof coalescer.push).toBe('function');
    expect(typeof coalescer.flush).toBe('function');
    expect(typeof coalescer.onFlush).toBe('function');
  });

  it('pushing 3 text deltas and flushing produces 1 coalesced string', () => {
    const coalescer = createChunkCoalescer();
    coalescer.push({ type: 'assistant.text.delta', delta: 'Hello' });
    coalescer.push({ type: 'assistant.text.delta', delta: ' ' });
    coalescer.push({ type: 'assistant.text.delta', delta: 'world' });
    const result = coalescer.flush();
    expect(result).toBe('Hello world');
  });

  it('coalesced string is concatenation in push order', () => {
    const coalescer = createChunkCoalescer();
    coalescer.push({ type: 'assistant.text.delta', delta: 'A' });
    coalescer.push({ type: 'assistant.text.delta', delta: 'B' });
    coalescer.push({ type: 'assistant.text.delta', delta: 'C' });
    expect(coalescer.flush()).toBe('ABC');
  });

  it('whiteboard.batch event triggers immediate passthrough', () => {
    const coalescer = createChunkCoalescer();
    const handler = vi.fn();
    coalescer.onPassthrough(handler);
    const event = { type: 'whiteboard.batch', batch_id: 'b1' };
    coalescer.push(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('turn.done event triggers immediate passthrough', () => {
    const coalescer = createChunkCoalescer();
    const handler = vi.fn();
    coalescer.onPassthrough(handler);
    const event = { type: 'turn.done', turnId: 't1' };
    coalescer.push(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('flush on empty buffer returns null', () => {
    const coalescer = createChunkCoalescer();
    expect(coalescer.flush()).toBeNull();
  });

  it('pendingLength reflects accumulated character count before flush', () => {
    const coalescer = createChunkCoalescer();
    coalescer.push({ type: 'assistant.text.delta', delta: 'Hello' });
    coalescer.push({ type: 'assistant.text.delta', delta: '!!' });
    expect(coalescer.pendingLength()).toBe(7);
  });

  it('pendingLength returns 0 after flush', () => {
    const coalescer = createChunkCoalescer();
    coalescer.push({ type: 'assistant.text.delta', delta: 'test' });
    coalescer.flush();
    expect(coalescer.pendingLength()).toBe(0);
  });

  it('auto-flushes when maxBufferChars exceeded', () => {
    const handler = vi.fn();
    const coalescer = createChunkCoalescer({ maxBufferChars: 10 });
    coalescer.onFlush(handler);
    coalescer.push({ type: 'assistant.text.delta', delta: 'A'.repeat(12) });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('A'.repeat(12));
  });

  it('destroy flushes remaining buffer and removes listener', () => {
    const handler = vi.fn();
    const coalescer = createChunkCoalescer();
    coalescer.onFlush(handler);
    coalescer.push({ type: 'assistant.text.delta', delta: 'leftover' });
    coalescer.destroy();
    expect(handler).toHaveBeenCalledWith('leftover');
    // After destroy, pushing should not call handler
    coalescer.push({ type: 'assistant.text.delta', delta: 'more' });
    coalescer.flush(); // no handler to call
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
