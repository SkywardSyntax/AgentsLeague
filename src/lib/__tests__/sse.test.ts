import { describe, it, expect } from 'vitest';
import { formatSSE, sseHeaders } from '../server/sse';

describe('formatSSE', () => {
  it('wraps payload as data: JSON\\n\\n', () => {
    const result = formatSSE({ type: 'test', value: 1 });
    expect(result).toBe('data: {"type":"test","value":1}\n\n');
  });

  it('handles nested objects', () => {
    const payload = { type: 'batch', data: { items: [1, 2, 3], nested: { deep: true } } };
    const result = formatSSE(payload);
    expect(result).toBe(`data: ${JSON.stringify(payload)}\n\n`);
  });

  it('handles strings', () => {
    const result = formatSSE('hello');
    expect(result).toBe('data: "hello"\n\n');
  });

  it('handles null', () => {
    const result = formatSSE(null);
    expect(result).toBe('data: null\n\n');
  });

  it('handles arrays', () => {
    const result = formatSSE([1, 2, 3]);
    expect(result).toBe('data: [1,2,3]\n\n');
  });
});

describe('sseHeaders', () => {
  it('returns correct Content-Type', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
  });

  it('sets no-cache', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Cache-Control']).toContain('no-cache');
  });

  it('sets keep-alive connection', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Connection']).toBe('keep-alive');
  });

  it('sets no-transform', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Cache-Control']).toContain('no-transform');
  });
});
