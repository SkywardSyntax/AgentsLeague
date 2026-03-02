import { describe, it, expect, beforeAll } from 'vitest';
import { formatSSE, sseHeaders } from '@/lib/server/sse';
import {
  mockAgentStream as _mockAgentStream,
  passthroughAgentStream as _passthroughAgentStream,
} from '@/app/api/agent/stream/__mocks__/mock-stream';

/**
 * Integration tests for the streaming pipeline.
 * Tests the mock POST handler → SSE event sequence without hitting OpenAI.
 */

const mockAgentStream = _mockAgentStream;
const passthroughAgentStream = _passthroughAgentStream;

async function readSSEEvents(response: Response): Promise<Record<string, unknown>[]> {
  const events: Record<string, unknown>[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() ?? '';
    for (const chunk of parts) {
      const lines = chunk
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('data:'));
      for (const line of lines) {
        const json = line.slice(5).trim();
        if (json) {
          events.push(JSON.parse(json));
        }
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim().startsWith('data:')) {
    const json = buffer.trim().slice(5).trim();
    if (json) events.push(JSON.parse(json));
  }

  return events;
}

describe('Stream Pipeline — Mock SSE Sequence', () => {
  it('produces expected SSE event type sequence', async () => {
    const response = mockAgentStream({ userMessage: 'draw a math circle' });
    const events = await readSSEEvents(response);

    expect(events.length).toBeGreaterThanOrEqual(4);

    // Verify event type sequence: text.delta(s) → text.done → whiteboard.batch → turn.done
    const types = events.map((e) => e.type);
    const textDeltas = types.filter((t) => t === 'assistant.text.delta');
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);

    const textDoneIdx = types.indexOf('assistant.text.done');
    expect(textDoneIdx).toBeGreaterThan(0);

    const batchIdx = types.indexOf('whiteboard.batch');
    expect(batchIdx).toBeGreaterThan(textDoneIdx);

    const turnDoneIdx = types.indexOf('turn.done');
    expect(turnDoneIdx).toBe(types.length - 1);
  });

  it('text.delta events accumulate to full text in text.done', async () => {
    const response = mockAgentStream({ userMessage: 'draw a biology cell diagram' });
    const events = await readSSEEvents(response);

    const deltas = events
      .filter((e) => e.type === 'assistant.text.delta')
      .map((e) => e.delta as string);
    const fullText = deltas.join('');

    expect(fullText).toContain('biology');
    expect(fullText.length).toBeGreaterThan(0);

    const textDone = events.find((e) => e.type === 'assistant.text.done');
    expect(textDone).toBeDefined();
    expect(textDone!.messageId).toBeTruthy();
  });

  it('whiteboard.batch contains valid batch with elements', async () => {
    const response = mockAgentStream({ userMessage: 'draw a physics force vector' });
    const events = await readSSEEvents(response);

    const batchEvent = events.find((e) => e.type === 'whiteboard.batch');
    expect(batchEvent).toBeDefined();

    const batch = batchEvent!.batch as { batch_id: string; elements: unknown[] };
    expect(batch.batch_id).toBeTruthy();
    expect(batch.elements.length).toBeGreaterThan(0);
  });

  it('turn.done includes usage stats', async () => {
    const response = mockAgentStream({ userMessage: 'draw something' });
    const events = await readSSEEvents(response);

    const turnDone = events.find((e) => e.type === 'turn.done');
    expect(turnDone).toBeDefined();
    expect(turnDone!.usage).toBeDefined();
    const usage = turnDone!.usage as { prompt: number; completion: number; total: number };
    expect(typeof usage.prompt).toBe('number');
    expect(typeof usage.completion).toBe('number');
    expect(typeof usage.total).toBe('number');
  });

  it('all events share the same turnId', async () => {
    const response = mockAgentStream({ userMessage: 'draw a math triangle' });
    const events = await readSSEEvents(response);

    const turnIds = events.map((e) => e.turnId).filter(Boolean);
    expect(turnIds.length).toBeGreaterThanOrEqual(4);
    const uniqueTurnIds = new Set(turnIds);
    expect(uniqueTurnIds.size).toBe(1);
  });

  it('domain detection selects correct mock batch', async () => {
    const bioResponse = mockAgentStream({ userMessage: 'draw a cell membrane' });
    const bioEvents = await readSSEEvents(bioResponse);
    const bioBatch = bioEvents.find((e) => e.type === 'whiteboard.batch');
    const bioBatchData = bioBatch!.batch as { batch_id: string };
    expect(bioBatchData.batch_id).toBe('mock-bio-1');

    const physResponse = mockAgentStream({ userMessage: 'draw a circuit physics' });
    const physEvents = await readSSEEvents(physResponse);
    const physBatch = physEvents.find((e) => e.type === 'whiteboard.batch');
    const physBatchData = physBatch!.batch as { batch_id: string };
    expect(physBatchData.batch_id).toBe('mock-phys-1');
  });
});

describe('Stream Pipeline — Passthrough Mode', () => {
  it('echoes passthrough batch as SSE', async () => {
    const customBatch = {
      batch_id: 'custom-test-1',
      elements: [
        { id: 'c1', type: 'rect', x: 10, y: 10, w: 100, h: 50 },
        { id: 'c2', type: 'text', x: 20, y: 20, text: 'Hello', size: 14 },
      ],
    };

    const response = passthroughAgentStream({
      userMessage: 'test passthrough',
      passthroughBatch: customBatch,
    });
    const events = await readSSEEvents(response);

    const batchEvent = events.find((e) => e.type === 'whiteboard.batch');
    expect(batchEvent).toBeDefined();
    const batch = batchEvent!.batch as { batch_id: string; elements: unknown[] };
    expect(batch.batch_id).toBe('custom-test-1');
    expect(batch.elements).toHaveLength(2);
  });

  it('passthrough error emits error event and closes stream', async () => {
    const response = passthroughAgentStream({
      userMessage: 'trigger error',
      passthroughError: 'simulated network failure',
    });
    const events = await readSSEEvents(response);

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toBe('simulated network failure');

    // No turn.done after error
    const turnDone = events.find((e) => e.type === 'turn.done');
    expect(turnDone).toBeUndefined();
  });

  it('passthrough without batch skips whiteboard.batch event', async () => {
    const response = passthroughAgentStream({
      userMessage: 'text only response',
    });
    const events = await readSSEEvents(response);

    const types = events.map((e) => e.type);
    expect(types).not.toContain('whiteboard.batch');
    expect(types).toContain('assistant.text.delta');
    expect(types).toContain('assistant.text.done');
    expect(types).toContain('turn.done');
  });
});

describe('Stream Pipeline — SSE Format', () => {
  it('response has correct SSE content-type headers', () => {
    const headers = sseHeaders() as Record<string, string>;
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
    expect(headers['Cache-Control']).toContain('no-cache');
    expect(headers['Connection']).toBe('keep-alive');
  });

  it('formatSSE produces valid SSE data lines', () => {
    const event = { type: 'test', value: 42 };
    const formatted = formatSSE(event);
    expect(formatted).toMatch(/^data: .+\n\n$/);

    const parsed = JSON.parse(formatted.replace(/^data: /, '').trim());
    expect(parsed).toEqual(event);
  });
});
