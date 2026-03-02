import { describe, it, expect } from 'vitest';
import { parseSSEBuffer } from '@/hooks/sse-parser';

describe('parseSSEBuffer', () => {
  it('parses single complete SSE event', () => {
    const buffer = 'data: {"type":"text","content":"hi"}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ type: 'text', content: 'hi' });
    expect(result.remaining).toBe('');
    expect(result.errors).toHaveLength(0);
  });

  it('handles multiple events in one chunk', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":3}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toEqual({ a: 1 });
    expect(result.events[1]).toEqual({ b: 2 });
    expect(result.events[2]).toEqual({ c: 3 });
  });

  it('buffers incomplete event until next chunk', () => {
    const buffer = 'data: {"partial":true}';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(0);
    expect(result.remaining).toBe(buffer);
  });

  it('ignores empty data: lines', () => {
    const buffer = 'data: \n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('ignores event: prefix lines', () => {
    const buffer = 'event: message\ndata: {"type":"ping"}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ type: 'ping' });
  });

  it('handles data: [DONE] sentinel without error', () => {
    const buffer = 'data: {"ok":true}\n\ndata: [DONE]\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ ok: true });
    expect(result.errors).toHaveLength(0);
  });

  it('reports error for invalid JSON in data line', () => {
    const buffer = 'data: {not valid json}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Invalid SSE JSON');
  });

  it('handles \\r\\n and \\n line endings', () => {
    const bufferCRLF = 'data: {"cr":true}\r\n\r\n';
    const resultCRLF = parseSSEBuffer(bufferCRLF);
    expect(resultCRLF.events).toHaveLength(1);
    expect(resultCRLF.events[0]).toEqual({ cr: true });

    const bufferLF = 'data: {"lf":true}\n\n';
    const resultLF = parseSSEBuffer(bufferLF);
    expect(resultLF.events).toHaveLength(1);
    expect(resultLF.events[0]).toEqual({ lf: true });
  });

  it('ignores SSE comment lines starting with :', () => {
    const buffer = ': this is a comment\ndata: {"val":42}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ val: 42 });
  });

  it('concatenates multiple data: lines with newline', () => {
    // Multi-line data per SSE spec: concatenate with \n
    // JSON allows newlines as whitespace between tokens
    const buffer = 'data: {"key":\ndata:  "value"}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ key: 'value' });

    // Genuinely invalid multi-line: broken string literal
    const buffer2 = 'data: {"key": "val\ndata: ue"}\n\n';
    const result2 = parseSSEBuffer(buffer2);
    expect(result2.events).toHaveLength(0);
    expect(result2.errors).toHaveLength(1);
  });

  it('returns remaining for a mix of complete and incomplete events', () => {
    const buffer = 'data: {"done":1}\n\ndata: {"pending"';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ done: 1 });
    expect(result.remaining).toBe('data: {"pending"');
  });
});
