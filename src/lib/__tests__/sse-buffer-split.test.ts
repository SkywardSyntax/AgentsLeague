import { describe, expect, it } from 'vitest';
import { parseSSEBuffer } from '@/hooks/sse-parser';

describe('parseSSEBuffer – buffer splitting', () => {
  it('returns no events and preserves remaining for a single incomplete chunk', () => {
    const { events, remaining } = parseSSEBuffer('data:{"ty');
    expect(events).toHaveLength(0);
    expect(remaining).toBe('data:{"ty');
  });

  it('parses a single complete event', () => {
    const buffer = 'data:{"type":"done"}\n\n';
    const { events, remaining } = parseSSEBuffer(buffer);
    expect(events).toEqual([{ type: 'done' }]);
    expect(remaining).toBe('');
  });

  it('correctly reassembles an event split across two chunks', () => {
    const chunk1 = 'data:{"ty';
    const chunk2 = 'pe":"done"}\n\n';

    // First chunk: no complete events
    const r1 = parseSSEBuffer(chunk1);
    expect(r1.events).toHaveLength(0);

    // Combine remaining with second chunk
    const combined = r1.remaining + chunk2;
    const r2 = parseSSEBuffer(combined);
    expect(r2.events).toEqual([{ type: 'done' }]);
    expect(r2.remaining).toBe('');
  });

  it('parses three events in one chunk', () => {
    const buffer =
      'data:{"type":"text","content":"a"}\n\n' +
      'data:{"type":"text","content":"b"}\n\n' +
      'data:{"type":"done"}\n\n';
    const { events, remaining } = parseSSEBuffer(buffer);
    expect(events).toEqual([
      { type: 'text', content: 'a' },
      { type: 'text', content: 'b' },
      { type: 'done' },
    ]);
    expect(remaining).toBe('');
  });

  it('preserves partial JSON remaining for next chunk', () => {
    const buffer =
      'data:{"type":"text","content":"hello"}\n\n' +
      'data:{"type":"text","con';
    const { events, remaining } = parseSSEBuffer(buffer);
    expect(events).toEqual([{ type: 'text', content: 'hello' }]);
    expect(remaining).toBe('data:{"type":"text","con');
  });

  it('produces no events from empty string', () => {
    const { events, remaining } = parseSSEBuffer('');
    expect(events).toHaveLength(0);
    expect(remaining).toBe('');
  });

  it('produces no events from a chunk of only newlines', () => {
    const { events } = parseSSEBuffer('\n\n\n\n');
    expect(events).toHaveLength(0);
  });

  it('handles \\r\\n line endings (Windows-style)', () => {
    const buffer = 'data:{"type":"done"}\r\n\r\n';
    const { events, remaining } = parseSSEBuffer(buffer);
    expect(events).toEqual([{ type: 'done' }]);
    expect(remaining).toBe('');
  });

  it('handles mixed \\n and \\r\\n line endings', () => {
    const buffer =
      'data:{"type":"text","content":"a"}\r\n\r\n' +
      'data:{"type":"done"}\n\n';
    const { events, remaining } = parseSSEBuffer(buffer);
    expect(events).toEqual([
      { type: 'text', content: 'a' },
      { type: 'done' },
    ]);
  });

  it('ignores non-data lines in SSE chunks', () => {
    const buffer = 'event:message\ndata:{"type":"done"}\n\n';
    const { events } = parseSSEBuffer(buffer);
    expect(events).toEqual([{ type: 'done' }]);
  });

  it('skips data: lines with no payload', () => {
    const buffer = 'data:\n\n';
    const { events } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(0);
  });

  it('joins multiple data: lines in a single SSE event per spec', () => {
    // Per SSE spec, multiple data: lines are concatenated with \n
    const buffer = 'data:{"a":1,\ndata:"b":2}\n\n';
    const { events } = parseSSEBuffer(buffer);
    expect(events).toEqual([{ a: 1, b: 2 }]);
  });

  it('simulates multi-chunk streaming with progressive buffer assembly', () => {
    const chunks = [
      'data:{"type":"tex',
      't","content":"hello"}\n\ndata:{"type":',
      '"done"}\n\n',
    ];

    let buffer = '';
    const allEvents: unknown[] = [];

    for (const chunk of chunks) {
      buffer += chunk;
      const { events, remaining } = parseSSEBuffer(buffer);
      allEvents.push(...events);
      buffer = remaining;
    }

    expect(allEvents).toEqual([
      { type: 'text', content: 'hello' },
      { type: 'done' },
    ]);
    expect(buffer).toBe('');
  });
});
