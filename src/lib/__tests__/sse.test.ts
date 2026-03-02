import { describe, it, expect } from 'vitest';
import { sseHeaders, formatSSE } from '../../lib/server/sse';

describe('sseHeaders', () => {
  it('returns Content-Type as text/event-stream', () => {
    const headers = sseHeaders();
    expect(headers).toHaveProperty('Content-Type', 'text/event-stream; charset=utf-8');
  });

  it('returns Cache-Control with no-cache', () => {
    const headers = sseHeaders();
    expect(headers).toHaveProperty('Cache-Control', 'no-cache, no-transform');
  });

  it('returns Connection keep-alive', () => {
    const headers = sseHeaders();
    expect(headers).toHaveProperty('Connection', 'keep-alive');
  });

  it('returns exactly three headers', () => {
    const headers = sseHeaders();
    expect(Object.keys(headers)).toHaveLength(3);
  });
});

describe('formatSSE', () => {
  it('formats an object payload as SSE data line', () => {
    expect(formatSSE({ msg: 'hello' })).toBe('data: {"msg":"hello"}\n\n');
  });

  it('formats null payload', () => {
    expect(formatSSE(null)).toBe('data: null\n\n');
  });

  it('formats array payload', () => {
    expect(formatSSE([1, 2, 3])).toBe('data: [1,2,3]\n\n');
  });

  it('formats string payload with JSON escaping', () => {
    expect(formatSSE('hello')).toBe('data: "hello"\n\n');
  });

  it('formats numeric payload', () => {
    expect(formatSSE(42)).toBe('data: 42\n\n');
  });

  it('formats boolean payload', () => {
    expect(formatSSE(true)).toBe('data: true\n\n');
  });
});
