import { describe, it, expect } from 'vitest';
import {
  AgentStreamRequestSchema,
  DrawBatchSchema,
  SemanticBatchSchema,
  normalizeDrawBatchPayload,
  normalizeSemanticBatchPayload,
} from '@/lib/schema';
import { sseHeaders } from '@/lib/server/sse';

describe('Lane 10 — Route Response Shapes', () => {
  it('AgentStreamRequestSchema validates correct input', () => {
    const valid = {
      sessionId: 's1',
      userMessage: 'hello',
      history: [],
    };
    const result = AgentStreamRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('AgentStreamRequestSchema rejects missing sessionId', () => {
    const invalid = { userMessage: 'hello', history: [] };
    const result = AgentStreamRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('AgentStreamRequestSchema rejects missing userMessage', () => {
    const invalid = { sessionId: 's1', history: [] };
    const result = AgentStreamRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('DrawBatchSchema validates correct batch', () => {
    const valid = {
      batch_id: 'b1',
      elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
    };
    const result = DrawBatchSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('DrawBatchSchema rejects invalid element type', () => {
    const invalid = {
      batch_id: 'b1',
      elements: [{ id: 'e1', type: 'invalid_type' }],
    };
    const result = DrawBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('SemanticBatchSchema validates correct batch', () => {
    const valid = {
      batch_id: 'sb1',
      template: 'equation_derivation_vertical',
      blocks: [
        {
          id: 'block1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'x^2' }],
        },
      ],
    };
    const result = SemanticBatchSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('SemanticBatchSchema rejects empty blocks', () => {
    const invalid = {
      batch_id: 'sb1',
      template: 'equation_derivation_vertical',
      blocks: [],
    };
    const result = SemanticBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('normalizeDrawBatchPayload returns { normalized, warnings }', () => {
    const result = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
    });
    expect(Object.keys(result).sort()).toMatchInlineSnapshot(`
      [
        "normalized",
        "warnings",
      ]
    `);
    expect(result.normalized).not.toBeNull();
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('normalizeSemanticBatchPayload returns { normalized, warnings }', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'sb1',
      template: 'equation_derivation_vertical',
      blocks: [
        {
          id: 'block1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'x^2' }],
        },
      ],
    });
    expect(Object.keys(result).sort()).toMatchInlineSnapshot(`
      [
        "normalized",
        "warnings",
      ]
    `);
    expect(result.normalized).not.toBeNull();
  });

  it('sseHeaders includes text/event-stream content type', () => {
    const headers = sseHeaders() as unknown as Record<string, string>;
    expect(headers['Content-Type']).toMatchInlineSnapshot(
      `"text/event-stream; charset=utf-8"`,
    );
  });
});
