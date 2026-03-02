import { describe, it, expect } from 'vitest';
import { formatSSE, createSSESender, sseHeaders } from '@/lib/server/sse';
import type { AgentSSEEvent } from '@/types/agent';

describe('sseHeaders', () => {
  it('returns text/event-stream content type', () => {
    const headers = sseHeaders();
    expect(headers).toHaveProperty('Content-Type', 'text/event-stream; charset=utf-8');
    expect(headers).toHaveProperty('Cache-Control', 'no-cache, no-transform');
  });
});

describe('formatSSE', () => {
  it('formats an AgentSSEEvent as SSE data line', () => {
    const event: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: 'hello' };
    const result = formatSSE(event);
    expect(result).toBe('data: {"type":"assistant.text.delta","turnId":"t1","delta":"hello"}\n\n');
  });

  it('formats turn.done with partial flag', () => {
    const event: AgentSSEEvent = { type: 'turn.done', turnId: 't1', partial: true };
    const result = formatSSE(event);
    expect(result).toContain('"partial":true');
    expect(result).toMatch(/^data: .+\n\n$/);
  });

  it('formats error events', () => {
    const event: AgentSSEEvent = {
      type: 'error',
      turnId: 't1',
      code: 'STREAM_FAILURE',
      message: 'fail',
      retryable: false,
    };
    const result = formatSSE(event);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.type).toBe('error');
    expect(parsed.retryable).toBe(false);
  });
});

describe('createSSESender', () => {
  it('enqueues encoded SSE data to the controller', () => {
    const chunks: Uint8Array[] = [];
    const controller = {
      enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    const send = createSSESender(controller);
    send({ type: 'assistant.text.delta', turnId: 't1', delta: 'hi' });

    expect(chunks).toHaveLength(1);
    const text = new TextDecoder().decode(chunks[0]);
    expect(text).toContain('"type":"assistant.text.delta"');
    expect(text).toMatch(/^data: .+\n\n$/);
  });

  it('handles multiple events sequentially', () => {
    const chunks: Uint8Array[] = [];
    const controller = {
      enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    const send = createSSESender(controller);
    send({ type: 'assistant.text.delta', turnId: 't1', delta: 'a' });
    send({ type: 'assistant.text.done', turnId: 't1', messageId: 'm1' });
    send({ type: 'turn.done', turnId: 't1' });

    expect(chunks).toHaveLength(3);
    const decoded = chunks.map((c) => JSON.parse(new TextDecoder().decode(c).slice(6).trim()));
    expect(decoded[0].type).toBe('assistant.text.delta');
    expect(decoded[1].type).toBe('assistant.text.done');
    expect(decoded[2].type).toBe('turn.done');
  });
});
