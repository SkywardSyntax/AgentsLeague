import { describe, expect, it } from 'vitest';
import { sseHeaders, formatSSE } from '@/lib/server/sse';

describe('sseHeaders', () => {
  const headers = sseHeaders() as Record<string, string>;

  it('returns Content-Type: text/event-stream; charset=utf-8', () => {
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
  });

  it('returns Cache-Control: no-cache, no-transform', () => {
    expect(headers['Cache-Control']).toBe('no-cache, no-transform');
  });

  it('returns Connection: keep-alive', () => {
    expect(headers['Connection']).toBe('keep-alive');
  });

  it('returns exactly 3 headers', () => {
    expect(Object.keys(headers)).toHaveLength(3);
  });
});

describe('formatSSE', () => {
  it('formats simple object', () => {
    expect(formatSSE({ type: 'data', value: 1 })).toBe(
      'data: {"type":"data","value":1}\n\n',
    );
  });

  it('formats string payload', () => {
    expect(formatSSE('hello')).toBe('data: "hello"\n\n');
  });

  it('formats null payload', () => {
    expect(formatSSE(null)).toBe('data: null\n\n');
  });

  it('formats nested object as valid SSE', () => {
    const result = formatSSE({ a: { b: { c: 1 } } });
    expect(result.startsWith('data: ')).toBe(true);
    expect(result.endsWith('\n\n')).toBe(true);
  });

  it('formats array payload', () => {
    expect(formatSSE([1, 2, 3])).toBe('data: [1,2,3]\n\n');
  });

  it('drops undefined values in objects (JSON.stringify behavior)', () => {
    expect(formatSSE({ a: 1, b: undefined })).toBe('data: {"a":1}\n\n');
  });

  it('output always ends with double newline', () => {
    const payloads: unknown[] = [
      42,
      'text',
      null,
      [1],
      { k: 'v' },
    ];
    for (const p of payloads) {
      expect(formatSSE(p).endsWith('\n\n')).toBe(true);
    }
  });
});
