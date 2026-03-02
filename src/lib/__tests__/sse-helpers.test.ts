import { describe, expect, it } from 'vitest';
import { formatSSE, sseHeaders } from '@/lib/server/sse';

describe('sseHeaders', () => {
  it('returns Content-Type as text/event-stream with utf-8 charset', () => {
    const headers = sseHeaders();
    expect(headers).toHaveProperty('Content-Type', 'text/event-stream; charset=utf-8');
  });

  it('returns Cache-Control with no-cache, no-transform', () => {
    const headers = sseHeaders();
    expect(headers).toHaveProperty('Cache-Control', 'no-cache, no-transform');
  });

  it('returns Connection keep-alive', () => {
    const headers = sseHeaders();
    expect(headers).toHaveProperty('Connection', 'keep-alive');
  });
});

describe('formatSSE', () => {
  it('formats an object as a single SSE data line with trailing double newline', () => {
    const result = formatSSE({ type: 'hello', value: 1 });
    expect(result).toBe('data: {"type":"hello","value":1}\n\n');
  });

  it('escapes embedded newlines in string fields via JSON.stringify', () => {
    const result = formatSSE({ text: 'line1\nline2' });
    expect(result).toBe('data: {"text":"line1\\nline2"}\n\n');
    // Should be a single data: line, not split
    expect(result.split('\n').filter((l) => l.startsWith('data:')).length).toBe(1);
  });

  it('serializes null as valid JSON', () => {
    expect(formatSSE(null)).toBe('data: null\n\n');
  });

  it('serializes undefined as non-JSON "data: undefined" (protocol caveat)', () => {
    // JSON.stringify(undefined) returns undefined (not a string "null")
    expect(formatSSE(undefined)).toBe('data: undefined\n\n');
  });

  it('serializes number primitives as valid JSON', () => {
    expect(formatSSE(42)).toBe('data: 42\n\n');
  });

  it('handles special characters (emoji, backslash) without corruption', () => {
    const result = formatSSE({ emoji: '🚀', path: 'C:\\Users' });
    const parsed = JSON.parse(result.replace(/^data: /, '').trim());
    expect(parsed.emoji).toBe('🚀');
    expect(parsed.path).toBe('C:\\Users');
  });
});
