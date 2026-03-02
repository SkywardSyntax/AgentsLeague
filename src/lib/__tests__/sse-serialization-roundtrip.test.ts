import { describe, expect, it } from 'vitest';
import { formatSSE, sseHeaders } from '@/lib/server/sse';
import type { AgentSSEEvent } from '@/types/agent';

function roundtrip(event: AgentSSEEvent): AgentSSEEvent {
  const sse = formatSSE(event);
  const jsonStr = sse.replace(/^data: /, '').trim();
  return JSON.parse(jsonStr) as AgentSSEEvent;
}

describe('iter28 · SSE serialization roundtrip', () => {
  it('assistant.text.delta event roundtrips through formatSSE→parse', () => {
    const event: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: 'Hello world' };
    expect(roundtrip(event)).toEqual(event);
  });

  it('assistant.text.done event roundtrips', () => {
    const event: AgentSSEEvent = { type: 'assistant.text.done', turnId: 't2', messageId: 'msg-abc' };
    expect(roundtrip(event)).toEqual(event);
  });

  it('whiteboard.batch event with full DrawBatch roundtrips', () => {
    const event: AgentSSEEvent = {
      type: 'whiteboard.batch',
      turnId: 't3',
      batch: {
        batch_id: 'b1',
        style_preset: 'rough_sketch',
        elements: [
          { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
          { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
          { id: 'e1', type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 },
          { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
          { id: 't1', type: 'text', x: 0, y: 0, text: 'Hi', size: 14 },
          { id: 'lx1', type: 'latex', x: 0, y: 0, tex: 'x^2', displayMode: true, fontSize: 20, align: 'center' },
          { id: 'c1', type: 'clear' },
        ],
      },
    };
    expect(roundtrip(event)).toEqual(event);
  });

  it('whiteboard.layout.diagnostics event roundtrips including semanticBatch', () => {
    const event: AgentSSEEvent = {
      type: 'whiteboard.layout.diagnostics',
      turnId: 't4',
      batchId: 'b2',
      violationsFixed: ['overlap', 'out-of-bounds'],
      templateUsed: 'equation_derivation_vertical',
      fallbackUsed: false,
      semanticBatch: {
        batch_id: 'sb1',
        template: 'freeform_semantic',
        blocks: [{ id: 'cap1', kind: 'caption', text: 'Test caption' }],
      },
    };
    expect(roundtrip(event)).toEqual(event);
  });

  it('warning event roundtrips with all fields', () => {
    const event: AgentSSEEvent = {
      type: 'warning',
      turnId: 't5',
      code: 'BATCH_OVERFLOW',
      message: 'Too many elements',
      context: 'batch-xyz',
    };
    expect(roundtrip(event)).toEqual(event);
  });

  it('error event roundtrips with retryable flag', () => {
    const event: AgentSSEEvent = {
      type: 'error',
      turnId: 't6',
      code: 'RATE_LIMIT',
      message: 'Rate limit exceeded',
      retryable: true,
    };
    const rt = roundtrip(event);
    expect(rt).toEqual(event);
    if (rt.type === 'error') {
      expect(rt.retryable).toBe(true);
    }
  });

  it('turn.done event roundtrips with usage tokens', () => {
    const event: AgentSSEEvent = {
      type: 'turn.done',
      turnId: 't7',
      usage: { prompt: 100, completion: 50, total: 150 },
    };
    expect(roundtrip(event)).toEqual(event);
  });

  it('turn.done event roundtrips without usage (undefined)', () => {
    const event: AgentSSEEvent = { type: 'turn.done', turnId: 't8' };
    const rt = roundtrip(event);
    expect(rt.type).toBe('turn.done');
    if (rt.type === 'turn.done') {
      expect(rt.turnId).toBe('t8');
      expect(rt.usage).toBeUndefined();
    }
  });

  it('sseHeaders returns correct Content-Type and Cache-Control', () => {
    const headers = sseHeaders() as unknown as Record<string, string>;
    expect(headers['Content-Type']).toContain('text/event-stream');
    expect(headers['Cache-Control']).toContain('no-cache');
    expect(headers['Connection']).toBe('keep-alive');
  });

  it('formatSSE always ends with double newline', () => {
    const events: unknown[] = [
      { type: 'turn.done', turnId: 'x' },
      { nested: { deep: true } },
      'simple string',
      42,
      null,
    ];
    for (const event of events) {
      const sse = formatSSE(event);
      expect(sse.endsWith('\n\n')).toBe(true);
      expect(sse.startsWith('data: ')).toBe(true);
    }
  });
});
