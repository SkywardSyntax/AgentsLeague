import { describe, it, expect } from 'vitest';
import { sseHeaders, formatSSE } from '../server/sse';

describe('SSE security headers', () => {
  it('sseHeaders() includes Content-Type text/event-stream', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
  });

  it('sseHeaders() includes Cache-Control no-cache', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Cache-Control']).toBe('no-cache, no-transform');
  });

  it('sseHeaders() includes Connection keep-alive', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Connection']).toBe('keep-alive');
  });
});

describe('SSE format validation', () => {
  it('formatSSE() escapes JSON correctly with script tags', () => {
    const result = formatSSE({ type: 'test', data: '<script>alert(1)</script>' });
    expect(result).toBe(
      'data: {"type":"test","data":"<script>alert(1)</script>"}\n\n',
    );
  });

  it('formatSSE() output conforms to SSE spec (data: prefix, double newline)', () => {
    const result = formatSSE({ hello: 'world' });
    expect(result.startsWith('data: ')).toBe(true);
    expect(result.endsWith('\n\n')).toBe(true);
    const json = JSON.parse(result.slice(6));
    expect(json).toEqual({ hello: 'world' });
  });

  it('formatSSE() handles nested objects and arrays', () => {
    const complex = { arr: [1, 2, 3], nested: { key: 'value' } };
    const result = formatSSE(complex);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed).toEqual(complex);
  });
});
