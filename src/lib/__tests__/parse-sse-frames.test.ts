import { describe, expect, it } from 'vitest';
import { parseSSEFrames } from '@/hooks/sse-parser';

describe('parseSSEFrames', () => {
  it('parses valid SSE frames and returns remaining buffer', () => {
    const buffer = 'data: {"type":"text_delta","content":"hello"}\n\ndata: {"type":"done"}\n\npartial';
    const { events, remaining, errors } = parseSSEFrames(buffer);
    expect(events).toEqual([
      { type: 'text_delta', content: 'hello' },
      { type: 'done' },
    ]);
    expect(remaining).toBe('partial');
    expect(errors).toHaveLength(0);
  });

  it('reports errors for malformed JSON and continues parsing', () => {
    const buffer = 'data: {bad json}\n\ndata: {"type":"ok"}\n\n';
    const { events, remaining, errors } = parseSSEFrames(buffer);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('Invalid SSE JSON payload received');
    expect(events).toEqual([{ type: 'ok' }]);
    expect(remaining).toBe('');
  });
});
