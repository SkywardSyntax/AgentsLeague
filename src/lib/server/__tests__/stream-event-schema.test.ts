import { describe, it, expect } from 'vitest';
import { sseHeaders, formatSSE } from '@/lib/server/sse';
import type { AgentSSEEvent, TokenUsage } from '@/types/agent';

describe('Lane 04 — Stream Event Schema', () => {
  it('sseHeaders returns correct Content-Type', () => {
    const headers = sseHeaders();
    expect(headers).toMatchInlineSnapshot(`
      {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      }
    `);
  });

  it('formatSSE wraps payload with data: prefix and double newline', () => {
    const result = formatSSE({ type: 'test' });
    expect(result).toMatchInlineSnapshot(`"data: {"type":"test"}

"`);
  });

  it('assistant.text.delta event shape is stable', () => {
    const event: AgentSSEEvent = {
      type: 'assistant.text.delta',
      turnId: 't1',
      delta: 'hello',
    };
    expect(Object.keys(event).sort()).toMatchInlineSnapshot(`
      [
        "delta",
        "turnId",
        "type",
      ]
    `);
  });

  it('assistant.text.done event shape is stable', () => {
    const event: AgentSSEEvent = {
      type: 'assistant.text.done',
      turnId: 't1',
      messageId: 'm1',
    };
    expect(Object.keys(event).sort()).toMatchInlineSnapshot(`
      [
        "messageId",
        "turnId",
        "type",
      ]
    `);
  });

  it('whiteboard.batch event shape is stable', () => {
    const event: AgentSSEEvent = {
      type: 'whiteboard.batch',
      turnId: 't1',
      batch: { batch_id: 'b1', elements: [] },
    };
    expect(Object.keys(event).sort()).toMatchInlineSnapshot(`
      [
        "batch",
        "turnId",
        "type",
      ]
    `);
  });

  it('whiteboard.layout.diagnostics event shape is stable', () => {
    const event: AgentSSEEvent = {
      type: 'whiteboard.layout.diagnostics',
      turnId: 't1',
      batchId: 'b1',
      violationsFixed: [],
      templateUsed: 'equation_derivation_vertical',
      fallbackUsed: false,
    };
    expect(Object.keys(event).sort()).toMatchInlineSnapshot(`
      [
        "batchId",
        "fallbackUsed",
        "templateUsed",
        "turnId",
        "type",
        "violationsFixed",
      ]
    `);
  });

  it('warning event shape is stable', () => {
    const event: AgentSSEEvent = {
      type: 'warning',
      turnId: 't1',
      code: 'WARN_001',
      message: 'test warning',
    };
    expect(Object.keys(event).sort()).toMatchInlineSnapshot(`
      [
        "code",
        "message",
        "turnId",
        "type",
      ]
    `);
  });

  it('error event shape is stable', () => {
    const event: AgentSSEEvent = {
      type: 'error',
      turnId: 't1',
      code: 'ERR_001',
      message: 'test error',
      retryable: false,
    };
    expect(Object.keys(event).sort()).toMatchInlineSnapshot(`
      [
        "code",
        "message",
        "retryable",
        "turnId",
        "type",
      ]
    `);
  });

  it('turn.done event shape is stable', () => {
    const event: AgentSSEEvent = {
      type: 'turn.done',
      turnId: 't1',
      usage: { prompt: 100, completion: 50, total: 150 },
    };
    expect(Object.keys(event).sort()).toMatchInlineSnapshot(`
      [
        "turnId",
        "type",
        "usage",
      ]
    `);
  });

  it('TokenUsage type shape is stable', () => {
    const usage: TokenUsage = { prompt: 10, completion: 20, total: 30 };
    expect(Object.keys(usage).sort()).toMatchInlineSnapshot(`
      [
        "completion",
        "prompt",
        "total",
      ]
    `);
  });
});
