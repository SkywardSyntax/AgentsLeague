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

describe('parseSSEBuffer adversarial inputs', () => {
  it('handles mid-JSON split across multiple chunks via incremental buffering', () => {
    const fullEvent = 'data: {"key":"value","num":42}\n\n';
    // Split at arbitrary mid-JSON positions and accumulate
    const chunk1 = fullEvent.slice(0, 12); // 'data: {"key"'
    const chunk2 = fullEvent.slice(12, 22); // ':"value","n'
    const chunk3 = fullEvent.slice(22); // 'um":42}\n\n'

    let buffer = '';
    buffer += chunk1;
    let result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(0);
    expect(result.remaining).toBe(buffer);

    buffer = result.remaining + chunk2;
    result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(0);

    buffer = result.remaining + chunk3;
    result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ key: 'value', num: 42 });
    expect(result.remaining).toBe('');
  });

  it('handles a large 50KB JSON payload without truncation', () => {
    const bigValue = 'x'.repeat(50_000);
    const payload = JSON.stringify({ data: bigValue });
    const buffer = `data: ${payload}\n\n`;
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect((result.events[0] as { data: string }).data).toHaveLength(50_000);
    expect(result.errors).toHaveLength(0);
  });

  it('handles 1-character-at-a-time buffering', () => {
    const fullEvent = 'data: {"a":1}\n\n';
    let buffer = '';
    let finalResult;
    for (let i = 0; i < fullEvent.length; i++) {
      buffer += fullEvent[i];
      const result = parseSSEBuffer(buffer);
      if (result.events.length > 0) {
        finalResult = result;
        break;
      }
      buffer = result.remaining;
    }
    expect(finalResult).toBeDefined();
    expect(finalResult!.events).toHaveLength(1);
    expect(finalResult!.events[0]).toEqual({ a: 1 });
  });

  it('does not double-strip duplicate data: prefix', () => {
    // "data: data: ..." → the content after first "data:" is " data: {"x":1}"
    // After trim, it becomes 'data: {"x":1}' which is not valid JSON
    const buffer = 'data: data: {"x":1}\n\n';
    const result = parseSSEBuffer(buffer);
    // The parsed data line is 'data: {"x":1}' (the literal after first data: prefix)
    // which is not valid JSON, so it should produce an error
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('handles mixed \\r\\n\\r\\n and \\n\\n delimiters in one buffer', () => {
    const buffer = 'data: {"a":1}\r\n\r\ndata: {"b":2}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({ a: 1 });
    expect(result.events[1]).toEqual({ b: 2 });
  });

  it('handles data: with leading space after colon (normalization)', () => {
    // Extra spaces after "data:" should be trimmed
    const buffer = 'data:    {"spaced":true}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ spaced: true });
  });

  it('handles data: with no space after colon', () => {
    const buffer = 'data:{"noSpace":true}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ noSpace: true });
  });

  it('remains stable after repeated invalid events', () => {
    const buffer = 'data: {bad1}\n\ndata: {bad2}\n\ndata: {"valid":true}\n\ndata: {bad3}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ valid: true });
    expect(result.errors).toHaveLength(3);
    expect(result.remaining).toBe('');
  });
});

describe('[DONE] interleaving', () => {
  it('events before [DONE] are parsed, [DONE] produces no event', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({ a: 1 });
    expect(result.events[1]).toEqual({ b: 2 });
    expect(result.errors).toHaveLength(0);
  });

  it('[DONE] with trailing data — parser is permissive and processes post-DONE events', () => {
    // The parser processes each chunk independently; [DONE] is not stream-terminal.
    // This documents the current permissive/resilient parsing behavior.
    const buffer = 'data: [DONE]\n\ndata: {"c":3}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ c: 3 });
    expect(result.errors).toHaveLength(0);
  });

  it('[DONE] with partial buffer keeps incomplete sentinel in remaining', () => {
    const buffer = 'data: {"a":1}\n\ndata: [DON';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ a: 1 });
    expect(result.remaining).toBe('data: [DON');
  });
});

describe('data: inside JSON content', () => {
  it('data: in a JSON string value is preserved correctly', () => {
    const buffer = 'data: {"label":"data: points","value":42}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect((result.events[0] as Record<string, unknown>).label).toBe('data: points');
    expect((result.events[0] as Record<string, unknown>).value).toBe(42);
  });

  it('nested data: data: in JSON string is preserved', () => {
    const buffer = 'data: {"nested":"data: data: deep"}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect((result.events[0] as Record<string, unknown>).nested).toBe('data: data: deep');
  });
});

describe('retry: and id: field handling', () => {
  it('id: and retry: fields are ignored, data: event is parsed', () => {
    const buffer = 'id: 7\nretry: 3000\ndata: {"x":1}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ x: 1 });
    expect(result.errors).toHaveLength(0);
  });

  it('retry-only block produces 0 events', () => {
    const buffer = 'retry: 5000\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('parseSSEBuffer non-object JSON payloads', () => {
  it('parses array payload', () => {
    const buffer = 'data: [1,2,3]\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual([1, 2, 3]);
  });

  it('parses primitive string payload', () => {
    const buffer = 'data: "hello"\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toBe('hello');
  });

  it('parses primitive number payload', () => {
    const buffer = 'data: 42\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toBe(42);
  });

  it('parses null payload', () => {
    const buffer = 'data: null\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toBeNull();
  });

  it('parses boolean payload', () => {
    const buffer = 'data: true\n\ndata: false\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toBe(true);
    expect(result.events[1]).toBe(false);
  });
});

describe('parseSSEBuffer unicode and special content', () => {
  it('handles unicode/emoji in JSON values', () => {
    const buffer = 'data: {"emoji":"🎉","text":"日本語"}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect((result.events[0] as Record<string, string>).emoji).toBe('🎉');
    expect((result.events[0] as Record<string, string>).text).toBe('日本語');
  });

  it('handles escaped unicode sequences in JSON', () => {
    const buffer = 'data: {"escaped":"\\u0048\\u0065\\u006C\\u006C\\u006F"}\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect((result.events[0] as Record<string, string>).escaped).toBe('Hello');
  });
});

describe('parseSSEBuffer unknown field handling', () => {
  it('event with only unknown fields (id:, retry:) produces no events', () => {
    const buffer = 'id: 42\nretry: 3000\n\n';
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('deeply nested JSON parses correctly', () => {
    const nested = { a: { b: { c: { d: { e: 'deep' } } } } };
    const buffer = `data: ${JSON.stringify(nested)}\n\n`;
    const result = parseSSEBuffer(buffer);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual(nested);
  });
});

describe('parseSSEBuffer empty and whitespace edge cases', () => {
  it('returns 0 events for buffer of only newlines', () => {
    const result = parseSSEBuffer('\n\n\n\n');
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns 0 events for comment-only block', () => {
    const result = parseSSEBuffer(': comment line\n\n');
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty for completely empty string', () => {
    const result = parseSSEBuffer('');
    expect(result.events).toHaveLength(0);
    expect(result.remaining).toBe('');
    expect(result.errors).toHaveLength(0);
  });
});
