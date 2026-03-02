import { describe, it, expect, vi } from 'vitest';
import { formatSSE, createSSESender, sseHeaders, formatSSEComment } from '@/lib/server/sse';
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

  it('formats error events with retryAfterMs', () => {
    const event: AgentSSEEvent = {
      type: 'error',
      turnId: 't1',
      code: 'RATE_LIMIT',
      message: 'rate limited',
      retryable: true,
      retryAfterMs: 3000,
    };
    const result = formatSSE(event);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.retryAfterMs).toBe(3000);
    expect(parsed.retryable).toBe(true);
  });

  it('encodes payload with embedded newline in string field', () => {
    const event: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: 'line1\nline2' };
    const result = formatSSE(event);
    // JSON.stringify escapes \n so the SSE data: line remains a single line
    expect(result).toMatch(/^data: .+\n\n$/);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.delta).toBe('line1\nline2');
  });

  it('encodes payload with backslash in string field', () => {
    const event: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: 'path\\file' };
    const result = formatSSE(event);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.delta).toBe('path\\file');
  });

  it('encodes payload with emoji in string field', () => {
    const event: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: 'Hello 😊' };
    const result = formatSSE(event);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.delta).toBe('Hello 😊');
  });

  it('encodes minimal turn.done event', () => {
    const event: AgentSSEEvent = { type: 'turn.done', turnId: 't1' };
    const result = formatSSE(event);
    expect(result).toBe('data: {"type":"turn.done","turnId":"t1"}\n\n');
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.type).toBe('turn.done');
  });
});

describe('formatSSEComment', () => {
  it('formats an SSE comment line', () => {
    const result = formatSSEComment('heartbeat');
    expect(result).toBe(': heartbeat\n\n');
  });

  it('formats empty comment', () => {
    const result = formatSSEComment('');
    expect(result).toBe(': \n\n');
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

  it('encoded output matches formatSSE result byte-for-byte', () => {
    const enqueue = vi.fn();
    const controller = { enqueue } as unknown as ReadableStreamDefaultController<Uint8Array>;

    const event: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: 'test' };
    const send = createSSESender(controller);
    send(event);

    const expected = new TextDecoder().decode(new TextEncoder().encode(formatSSE(event)));
    expect(enqueue).toHaveBeenCalledOnce();
    const actual = new TextDecoder().decode(enqueue.mock.calls[0][0]);
    expect(actual).toBe(expected);
  });

  it('encodes multi-byte characters correctly', () => {
    const chunks: Uint8Array[] = [];
    const controller = {
      enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    const send = createSSESender(controller);
    send({ type: 'assistant.text.delta', turnId: 't1', delta: '日本語テスト 🎉' });

    const text = new TextDecoder().decode(chunks[0]);
    const parsed = JSON.parse(text.slice(6).trim());
    expect(parsed.delta).toBe('日本語テスト 🎉');
  });
});

describe('formatSSE edge cases', () => {
  it('serializes turn.done with undefined optional fields', () => {
    const event: AgentSSEEvent = { type: 'turn.done', turnId: 't1' };
    const result = formatSSE(event);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.partial).toBeUndefined();
    expect(parsed.usage).toBeUndefined();
    expect(parsed.type).toBe('turn.done');
  });

  it('serializes warning event with undefined context', () => {
    const event: AgentSSEEvent = {
      type: 'warning',
      turnId: 't1',
      code: 'W001',
      message: 'some warning',
    };
    const result = formatSSE(event);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.context).toBeUndefined();
    expect(parsed.message).toBe('some warning');
  });

  it('serializes very long delta string (100KB) without truncation', () => {
    const longDelta = 'x'.repeat(100_000);
    const event: AgentSSEEvent = { type: 'assistant.text.delta', turnId: 't1', delta: longDelta };
    const result = formatSSE(event);
    const parsed = JSON.parse(result.slice(6).trim());
    expect(parsed.delta).toHaveLength(100_000);
    expect(result).toMatch(/^data: .+\n\n$/);
  });
});
