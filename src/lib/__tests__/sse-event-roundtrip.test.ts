import { describe, it, expect } from 'vitest';
import { formatSSE, formatSSEComment } from '@/lib/server/sse';
import { isValidAgentSSEEvent } from '@/lib/client/event-validator';
import type { AgentSSEEvent } from '@/types/agent';

/**
 * SSE sender → event validator round-trip integration tests.
 *
 * Verifies that every event type encoded by formatSSE can be parsed back
 * from the SSE `data:` line and passes isValidAgentSSEEvent validation.
 */

function parseSSEDataLine(sse: string): unknown {
  const match = sse.match(/^data: (.+)\n\n$/);
  if (!match) throw new Error(`Not a valid SSE data frame: ${sse.slice(0, 80)}`);
  return JSON.parse(match[1]);
}

describe('SSE sender → event validator round-trip', () => {
  const wellFormedEvents: Array<{ label: string; event: AgentSSEEvent }> = [
    {
      label: 'assistant.text.delta',
      event: { type: 'assistant.text.delta', turnId: 't1', delta: 'Hello world' },
    },
    {
      label: 'assistant.text.done',
      event: { type: 'assistant.text.done', turnId: 't1', messageId: 'msg-001' },
    },
    {
      label: 'whiteboard.batch',
      event: {
        type: 'whiteboard.batch',
        turnId: 't1',
        batch: {
          batch_id: 'b1',
          elements: [
            { id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50 },
            { id: 't1', type: 'text', x: 10, y: 10, text: 'hello' },
          ],
        },
      },
    },
    {
      label: 'whiteboard.layout.diagnostics',
      event: {
        type: 'whiteboard.layout.diagnostics',
        turnId: 't1',
        batchId: 'b1',
        violationsFixed: ['overlap_text'],
        templateUsed: 'legacy_draw_batch',
        fallbackUsed: false,
      },
    },
    {
      label: 'warning',
      event: { type: 'warning', turnId: 't1', code: 'W001', message: 'Low confidence' },
    },
    {
      label: 'error',
      event: {
        type: 'error',
        turnId: 't1',
        code: 'STREAM_FAILURE',
        message: 'Connection lost',
        retryable: true,
        retryAfterMs: 2000,
      },
    },
    {
      label: 'turn.done',
      event: { type: 'turn.done', turnId: 't1', usage: { prompt: 100, completion: 50, total: 150 } },
    },
  ];

  describe('Test 1: all event types round-trip through encode → parse → validate', () => {
    for (const { label, event } of wellFormedEvents) {
      it(`${label} passes round-trip validation`, () => {
        const encoded = formatSSE(event);
        const parsed = parseSSEDataLine(encoded);
        expect(isValidAgentSSEEvent(parsed)).toBe(true);
      });
    }
  });

  describe('Test 2: forward compatibility — extra fields are accepted', () => {
    it('accepts event with extra unexpected fields', () => {
      const event: AgentSSEEvent = { type: 'turn.done', turnId: 't1' };
      const encoded = formatSSE(event);
      const parsed = parseSSEDataLine(encoded) as Record<string, unknown>;
      // Add extra fields after parsing (simulating future API extensions)
      parsed.newField = 'surprise';
      parsed.metadata = { version: 2 };
      expect(isValidAgentSSEEvent(parsed)).toBe(true);
    });

    it('accepts text.delta with extra fields', () => {
      const event = { type: 'assistant.text.delta', turnId: 't1', delta: 'hi' } as AgentSSEEvent;
      const encoded = formatSSE(event);
      const parsed = parseSSEDataLine(encoded) as Record<string, unknown>;
      parsed.traceId = 'trace-abc';
      expect(isValidAgentSSEEvent(parsed)).toBe(true);
    });

    it('accepts whiteboard.batch elements with extra properties', () => {
      const event: AgentSSEEvent = {
        type: 'whiteboard.batch',
        turnId: 't1',
        batch: {
          batch_id: 'b1',
          elements: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50, customProp: true } as never],
        },
      };
      const encoded = formatSSE(event);
      const parsed = parseSSEDataLine(encoded);
      expect(isValidAgentSSEEvent(parsed)).toBe(true);
    });
  });

  describe('Test 3: invalid element-level data is rejected', () => {
    it('rejects whiteboard.batch with element missing id', () => {
      const raw = {
        type: 'whiteboard.batch',
        turnId: 't1',
        batch: {
          batch_id: 'b1',
          elements: [{ type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
        },
      };
      const encoded = formatSSE(raw as unknown as AgentSSEEvent);
      const parsed = parseSSEDataLine(encoded);
      expect(isValidAgentSSEEvent(parsed)).toBe(false);
    });

    it('rejects whiteboard.batch with element missing type', () => {
      const raw = {
        type: 'whiteboard.batch',
        turnId: 't1',
        batch: {
          batch_id: 'b1',
          elements: [{ id: 'r1', x: 0, y: 0, w: 10, h: 10 }],
        },
      };
      const encoded = formatSSE(raw as unknown as AgentSSEEvent);
      const parsed = parseSSEDataLine(encoded);
      expect(isValidAgentSSEEvent(parsed)).toBe(false);
    });

    it('rejects whiteboard.batch with null element', () => {
      const raw = {
        type: 'whiteboard.batch',
        turnId: 't1',
        batch: { batch_id: 'b1', elements: [null] },
      };
      const encoded = formatSSE(raw as unknown as AgentSSEEvent);
      const parsed = parseSSEDataLine(encoded);
      expect(isValidAgentSSEEvent(parsed)).toBe(false);
    });
  });

  describe('Test 4: multi-event stream round-trip', () => {
    it('encodes 5 events, splits by \\n\\n, each chunk validates independently', () => {
      const events: AgentSSEEvent[] = [
        { type: 'assistant.text.delta', turnId: 't1', delta: 'Hello' },
        { type: 'assistant.text.delta', turnId: 't1', delta: ' world' },
        { type: 'whiteboard.batch', turnId: 't1', batch: { batch_id: 'b1', elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] } },
        { type: 'warning', turnId: 't1', code: 'W1', message: 'warn' },
        { type: 'turn.done', turnId: 't1' },
      ];

      const combined = events.map((e) => formatSSE(e)).join('');
      const frames = combined.split('\n\n').filter((f) => f.trim().length > 0);

      expect(frames).toHaveLength(5);

      for (let i = 0; i < frames.length; i++) {
        const dataLine = frames[i].trim();
        expect(dataLine.startsWith('data: ')).toBe(true);
        const parsed = JSON.parse(dataLine.slice(6));
        expect(isValidAgentSSEEvent(parsed)).toBe(true);
        expect(parsed.type).toBe(events[i].type);
      }
    });

    it('handles interleaved SSE comments in the stream', () => {
      const events: AgentSSEEvent[] = [
        { type: 'assistant.text.delta', turnId: 't1', delta: 'Hi' },
        { type: 'turn.done', turnId: 't1' },
      ];

      const combined =
        formatSSEComment('heartbeat') +
        formatSSE(events[0]) +
        formatSSEComment('keepalive') +
        formatSSE(events[1]);

      const frames = combined.split('\n\n').filter((f) => f.trim().length > 0);

      // Filter data frames vs comment frames
      const dataFrames = frames.filter((f) => f.trim().startsWith('data:'));
      const commentFrames = frames.filter((f) => f.trim().startsWith(':'));

      expect(dataFrames).toHaveLength(2);
      expect(commentFrames).toHaveLength(2);

      for (const frame of dataFrames) {
        const parsed = JSON.parse(frame.trim().slice(6));
        expect(isValidAgentSSEEvent(parsed)).toBe(true);
      }
    });
  });

  describe('edge cases', () => {
    it('handles delta with newlines (JSON-escaped in SSE data line)', () => {
      const event: AgentSSEEvent = {
        type: 'assistant.text.delta',
        turnId: 't1',
        delta: 'line1\nline2\nline3',
      };
      const encoded = formatSSE(event);
      // SSE data line should be a single line (JSON.stringify escapes \n)
      const lines = encoded.split('\n');
      expect(lines[0].startsWith('data: ')).toBe(true);
      const parsed = parseSSEDataLine(encoded);
      expect(isValidAgentSSEEvent(parsed)).toBe(true);
      expect((parsed as { delta: string }).delta).toBe('line1\nline2\nline3');
    });

    it('handles delta with unicode and special characters', () => {
      const event: AgentSSEEvent = {
        type: 'assistant.text.delta',
        turnId: 't1',
        delta: '∫f(x)dx = F(x) + C 🎯',
      };
      const encoded = formatSSE(event);
      const parsed = parseSSEDataLine(encoded);
      expect(isValidAgentSSEEvent(parsed)).toBe(true);
      expect((parsed as { delta: string }).delta).toBe('∫f(x)dx = F(x) + C 🎯');
    });

    it('handles warning with optional context field', () => {
      const event: AgentSSEEvent = {
        type: 'warning',
        turnId: 't1',
        code: 'ELEMENT_COUNT_HIGH',
        message: 'Batch has many elements',
        context: 'batch_id=b1 count=85',
      };
      const encoded = formatSSE(event);
      const parsed = parseSSEDataLine(encoded);
      expect(isValidAgentSSEEvent(parsed)).toBe(true);
    });
  });
});
