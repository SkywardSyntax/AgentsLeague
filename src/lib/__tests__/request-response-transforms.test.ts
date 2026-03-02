import { describe, expect, it } from 'vitest';
import { AgentStreamRequestSchema } from '@/lib/schema';
import { formatSSE, sseHeaders } from '@/lib/server/sse';
import type { AgentSSEEvent } from '@/types/agent';

describe('iter28 · Request/Response transforms', () => {
  it('AgentStreamRequestSchema validates minimal valid request', () => {
    const result = AgentStreamRequestSchema.safeParse({
      sessionId: 'sess-1',
      userMessage: 'Hello',
      history: [],
    });
    expect(result.success).toBe(true);
  });

  it('AgentStreamRequestSchema rejects missing sessionId', () => {
    const result = AgentStreamRequestSchema.safeParse({
      userMessage: 'Hello',
      history: [],
    });
    expect(result.success).toBe(false);
  });

  it('AgentStreamRequestSchema rejects missing userMessage', () => {
    const result = AgentStreamRequestSchema.safeParse({
      sessionId: 'sess-1',
      history: [],
    });
    expect(result.success).toBe(false);
  });

  it('AgentStreamRequestSchema accepts optional whiteboardContext', () => {
    const result = AgentStreamRequestSchema.safeParse({
      sessionId: 'sess-1',
      userMessage: 'Draw something',
      history: [],
      whiteboardContext: {
        elementCount: 5,
        elementTypeCounts: { rect: 3, line: 2 },
        recentElements: [{ id: 'el1', type: 'rect' }],
        suggestedNextOrigin: { x: 100, y: 200 },
      },
    });
    expect(result.success).toBe(true);
  });

  it('AgentStreamRequestSchema enforces history max 100', () => {
    const bigHistory = Array.from({ length: 101 }, (_, i) => ({
      id: `msg-${i}`,
      role: 'user',
      content: `msg ${i}`,
      createdAt: 1000 + i,
    }));
    const result = AgentStreamRequestSchema.safeParse({
      sessionId: 'sess-1',
      userMessage: 'Hello',
      history: bigHistory,
    });
    expect(result.success).toBe(false);
  });

  it('AgentStreamRequestSchema accepts plannerMode values', () => {
    for (const mode of ['semantic_preferred', 'legacy_draw_only'] as const) {
      const result = AgentStreamRequestSchema.safeParse({
        sessionId: 'sess-1',
        userMessage: 'Test',
        history: [],
        plannerMode: mode,
      });
      expect(result.success).toBe(true);
    }
  });

  it('AgentStreamRequestSchema rejects empty sessionId', () => {
    const result = AgentStreamRequestSchema.safeParse({
      sessionId: '',
      userMessage: 'Hello',
      history: [],
    });
    expect(result.success).toBe(false);
  });

  it('AgentStreamRequestSchema rejects empty userMessage', () => {
    const result = AgentStreamRequestSchema.safeParse({
      sessionId: 'sess-1',
      userMessage: '',
      history: [],
    });
    expect(result.success).toBe(false);
  });

  it('formatSSE roundtrip preserves complex nested response payload', () => {
    const event: AgentSSEEvent = {
      type: 'whiteboard.batch',
      turnId: 't1',
      batch: {
        batch_id: 'b1',
        style_preset: 'rough_sketch',
        elements: [
          { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
          { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
        ],
      },
    };
    const sse = formatSSE(event);
    const parsed = JSON.parse(sse.replace(/^data: /, '').trim());
    expect(parsed).toEqual(event);
  });

  it('AgentStreamRequestSchema accepts optional whiteboardContextV2', () => {
    const result = AgentStreamRequestSchema.safeParse({
      sessionId: 'sess-1',
      userMessage: 'Test',
      history: [],
      whiteboardContextV2: {
        scene_summary: { element_count: 0, type_counts: {} },
        occupied_regions: [],
        anchors: [],
        recent_blocks: [],
        suggested_next_regions: [],
        token_budget_hint: { max_chars: 5000 },
      },
    });
    expect(result.success).toBe(true);
  });
});
