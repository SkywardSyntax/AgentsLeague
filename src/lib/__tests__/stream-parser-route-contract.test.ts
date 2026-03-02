import { describe, it, expect } from 'vitest';
import { formatSSE, sseHeaders } from '@/lib/server/sse';
import type { AgentSSEEvent, DrawBatch } from '@/types/agent';

function stripAndParse(sseOutput: string): unknown {
  const line = sseOutput
    .split(/\r?\n/)
    .find((l) => l.startsWith('data:'));
  if (!line) throw new Error('No data: line found');
  return JSON.parse(line.slice(5).trim());
}

describe('Stream parser↔Route contract', () => {
  it('formatSSE output starts with data: prefix', () => {
    const output = formatSSE({ type: 'test' } as unknown as AgentSSEEvent);
    expect(output.startsWith('data: ')).toBe(true);
  });

  it('formatSSE output ends with double newline', () => {
    const output = formatSSE({ type: 'test' } as unknown as AgentSSEEvent);
    expect(output.endsWith('\n\n')).toBe(true);
  });

  it('formatSSE output is parseable by JSON.parse after stripping prefix', () => {
    const payload: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: 'hello' };
    const parsed = stripAndParse(formatSSE(payload));
    expect(parsed).toEqual(payload);
  });

  it('each AgentSSEEvent type survives formatSSE→parse round-trip', () => {
    const events: AgentSSEEvent[] = [
      { type: 'assistant.text.delta', turnId: 't1', delta: 'hi' },
      { type: 'assistant.text.done', turnId: 't1', messageId: 'm1' },
      { type: 'whiteboard.batch', turnId: 't1', batch: { batch_id: 'b1', elements: [] } },
      { type: 'whiteboard.layout.diagnostics', turnId: 't1', batchId: 'b1', violationsFixed: [], templateUsed: 'freeform_semantic', fallbackUsed: false },
      { type: 'warning', turnId: 't1', code: 'W1', message: 'warn' },
      { type: 'error', turnId: 't1', code: 'E1', message: 'err', retryable: false },
      { type: 'turn.done', turnId: 't1', usage: { prompt: 10, completion: 5, total: 15 } },
    ];
    for (const event of events) {
      const parsed = stripAndParse(formatSSE(event));
      expect(parsed).toEqual(event);
    }
  });

  it('sseHeaders includes text/event-stream content type', () => {
    const headers = sseHeaders();
    expect((headers as Record<string, string>)['Content-Type']).toContain('text/event-stream');
  });

  it('sseHeaders includes no-cache cache control', () => {
    const headers = sseHeaders();
    expect((headers as Record<string, string>)['Cache-Control']).toContain('no-cache');
  });

  it('sseHeaders includes keep-alive connection', () => {
    const headers = sseHeaders();
    expect((headers as Record<string, string>)['Connection']).toBe('keep-alive');
  });

  it('nested DrawBatch in whiteboard.batch survives formatSSE round-trip', () => {
    const batch: DrawBatch = {
      batch_id: 'deep-1',
      style_preset: 'rough_sketch',
      elements: [
        { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
        { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      ],
    };
    const event: AgentSSEEvent = { type: 'whiteboard.batch', turnId: 't1', batch };
    const parsed = stripAndParse(formatSSE(event)) as typeof event;
    expect(parsed.batch.elements).toHaveLength(2);
    expect(parsed.batch.style_preset).toBe('rough_sketch');
  });

  it('special characters in text delta survive round-trip', () => {
    const event: AgentSSEEvent = {
      type: 'assistant.text.delta', turnId: 't1',
      delta: 'Hello 世界 \\frac{a}{b} \n\ttab "quotes"',
    };
    const parsed = stripAndParse(formatSSE(event)) as typeof event;
    expect(parsed.delta).toBe(event.delta);
  });

  it('empty object survives formatSSE→parse round-trip', () => {
    const parsed = stripAndParse(formatSSE({} as AgentSSEEvent));
    expect(parsed).toEqual({});
  });
});
