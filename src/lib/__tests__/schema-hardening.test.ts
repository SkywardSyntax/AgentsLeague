import { describe, it, expect } from 'vitest';
import {
  AgentStreamRequestSchema,
  DrawBatchSchema,
  SemanticBatchSchema,
  AgentSSEEventSchema,
  validateSSEEvent,
  normalizeSemanticBatchPayload,
} from '../schema';

describe('Schema hardening', () => {
  describe('sessionId validation', () => {
    const base = {
      userMessage: 'hello',
      history: [],
    };

    it('accepts valid alphanumeric-dash-underscore sessionId', () => {
      const result = AgentStreamRequestSchema.safeParse({ ...base, sessionId: 'abc-123_XYZ' });
      expect(result.success).toBe(true);
    });

    it('rejects sessionId with special characters', () => {
      const result = AgentStreamRequestSchema.safeParse({ ...base, sessionId: 'abc!@#$%' });
      expect(result.success).toBe(false);
    });

    it('rejects sessionId with spaces', () => {
      const result = AgentStreamRequestSchema.safeParse({ ...base, sessionId: 'abc def' });
      expect(result.success).toBe(false);
    });

    it('rejects sessionId longer than 128 chars', () => {
      const result = AgentStreamRequestSchema.safeParse({ ...base, sessionId: 'a'.repeat(129) });
      expect(result.success).toBe(false);
    });

    it('accepts sessionId of exactly 128 chars', () => {
      const result = AgentStreamRequestSchema.safeParse({ ...base, sessionId: 'a'.repeat(128) });
      expect(result.success).toBe(true);
    });
  });

  describe('color field validation', () => {
    it('accepts hex color #fff', () => {
      const result = DrawBatchSchema.safeParse({
        batch_id: 'b1',
        elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, color: '#fff' }],
      });
      expect(result.success).toBe(true);
    });

    it('accepts hex color #aabbcc', () => {
      const result = DrawBatchSchema.safeParse({
        batch_id: 'b1',
        elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, color: '#aabbcc' }],
      });
      expect(result.success).toBe(true);
    });

    it('accepts named color', () => {
      const result = DrawBatchSchema.safeParse({
        batch_id: 'b1',
        elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, color: 'red' }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid color format', () => {
      const result = DrawBatchSchema.safeParse({
        batch_id: 'b1',
        elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, color: 'rgb(0,0,0)' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects color exceeding max length', () => {
      const result = DrawBatchSchema.safeParse({
        batch_id: 'b1',
        elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, color: 'a'.repeat(31) }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('id and batch_id max lengths', () => {
    it('rejects element id exceeding 64 chars', () => {
      const result = DrawBatchSchema.safeParse({
        batch_id: 'b1',
        elements: [{ id: 'x'.repeat(65), type: 'clear' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects batch_id exceeding 64 chars', () => {
      const result = DrawBatchSchema.safeParse({
        batch_id: 'x'.repeat(65),
        elements: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects semantic batch_id exceeding 64 chars', () => {
      const result = SemanticBatchSchema.safeParse({
        batch_id: 'x'.repeat(65),
        template: 'freeform_semantic',
        blocks: [{ id: 'b1', kind: 'caption', text: 'hello' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('title and label max lengths', () => {
    it('rejects semantic block title exceeding 200 chars', () => {
      const result = SemanticBatchSchema.safeParse({
        batch_id: 'b1',
        template: 'freeform_semantic',
        blocks: [
          {
            id: 'eq1',
            kind: 'equation_stack',
            title: 't'.repeat(201),
            lines: [{ id: 'l1', tex: 'x=1' }],
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects relation label exceeding 200 chars', () => {
      const result = SemanticBatchSchema.safeParse({
        batch_id: 'b1',
        template: 'freeform_semantic',
        blocks: [
          { id: 'a', kind: 'caption', text: 'A' },
          { id: 'b', kind: 'caption', text: 'B' },
        ],
        relations: [
          {
            id: 'r1',
            type: 'maps_to',
            from_block_id: 'a',
            to_block_id: 'b',
            label: 'l'.repeat(201),
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('relations max cap', () => {
    it('rejects relations array exceeding 100', () => {
      const blocks = [
        { id: 'a', kind: 'caption' as const, text: 'A' },
        { id: 'b', kind: 'caption' as const, text: 'B' },
      ];
      const relations = Array.from({ length: 101 }, (_, i) => ({
        id: `r${i}`,
        type: 'maps_to' as const,
        from_block_id: 'a',
        to_block_id: 'b',
      }));
      const result = SemanticBatchSchema.safeParse({
        batch_id: 'b1',
        template: 'freeform_semantic',
        blocks,
        relations,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('normalizeSemanticBatchPayload - self-reference and cycle detection', () => {
  const makeBlocks = (...ids: string[]) =>
    ids.map((id) => ({ id, kind: 'caption', text: `Block ${id}` }));

  it('filters self-referencing relations with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a', 'b'),
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'a', to_block_id: 'a' },
        { id: 'r2', type: 'maps_to', from_block_id: 'a', to_block_id: 'b' },
      ],
    });
    expect(normalized!.relations).toHaveLength(1);
    expect(normalized!.relations![0].id).toBe('r2');
    expect(warnings.some((w) => w.includes('self-referencing'))).toBe(true);
  });

  it('detects simple A→B→A cycle and drops the closing edge', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a', 'b'),
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'a', to_block_id: 'b' },
        { id: 'r2', type: 'explains', from_block_id: 'b', to_block_id: 'a' },
      ],
    });
    expect(normalized!.relations).toHaveLength(1);
    expect(normalized!.relations![0].id).toBe('r1');
    expect(warnings.some((w) => w.includes('cycle'))).toBe(true);
  });

  it('detects A→B→C→A triangle cycle', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a', 'b', 'c'),
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'a', to_block_id: 'b' },
        { id: 'r2', type: 'maps_to', from_block_id: 'b', to_block_id: 'c' },
        { id: 'r3', type: 'maps_to', from_block_id: 'c', to_block_id: 'a' },
      ],
    });
    expect(normalized!.relations).toHaveLength(2);
    expect(warnings.some((w) => w.includes('cycle'))).toBe(true);
  });

  it('allows acyclic DAG relations', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a', 'b', 'c'),
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'a', to_block_id: 'b' },
        { id: 'r2', type: 'maps_to', from_block_id: 'a', to_block_id: 'c' },
        { id: 'r3', type: 'maps_to', from_block_id: 'b', to_block_id: 'c' },
      ],
    });
    expect(normalized!.relations).toHaveLength(3);
    expect(warnings.filter((w) => w.includes('cycle'))).toHaveLength(0);
  });

  it('truncates relations array exceeding 100 with warning', () => {
    const blocks = makeBlocks('a', 'b');
    const relations = Array.from({ length: 105 }, (_, i) => ({
      id: `r${i}`,
      type: 'maps_to',
      from_block_id: 'a',
      to_block_id: 'b',
    }));
    const { warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks,
      relations,
    });
    expect(warnings.some((w) => w.includes('truncated'))).toBe(true);
  });
});

describe('AgentSSEEventSchema validation', () => {
  it('validates text.delta event', () => {
    const event = { type: 'assistant.text.delta', turnId: 't1', delta: 'hello' };
    expect(validateSSEEvent(event)).toEqual(event);
  });

  it('validates text.done event', () => {
    const event = { type: 'assistant.text.done', turnId: 't1', messageId: 'm1' };
    expect(validateSSEEvent(event)).toEqual(event);
  });

  it('validates whiteboard.batch event', () => {
    const event = {
      type: 'whiteboard.batch',
      turnId: 't1',
      batch: { batch_id: 'b1', elements: [{ id: 'e1', type: 'clear' }] },
    };
    expect(validateSSEEvent(event)).toBeTruthy();
  });

  it('validates warning event', () => {
    const event = { type: 'warning', turnId: 't1', code: 'W001', message: 'test warning' };
    expect(validateSSEEvent(event)).toEqual(event);
  });

  it('validates error event', () => {
    const event = { type: 'error', turnId: 't1', code: 'E001', message: 'fail', retryable: false };
    expect(validateSSEEvent(event)).toEqual(event);
  });

  it('validates turn.done event with usage', () => {
    const event = { type: 'turn.done', turnId: 't1', usage: { prompt: 100, completion: 50, total: 150 } };
    expect(validateSSEEvent(event)).toEqual(event);
  });

  it('validates turn.done event without usage', () => {
    const event = { type: 'turn.done', turnId: 't1' };
    expect(validateSSEEvent(event)).toEqual(event);
  });

  it('validates diagnostics event', () => {
    const event = {
      type: 'whiteboard.layout.diagnostics',
      turnId: 't1',
      batchId: 'b1',
      violationsFixed: ['overlap'],
      templateUsed: 'freeform_semantic',
      fallbackUsed: false,
    };
    expect(validateSSEEvent(event)).toBeTruthy();
  });

  it('returns null for invalid event type', () => {
    expect(validateSSEEvent({ type: 'unknown', turnId: 't1' })).toBeNull();
  });

  it('returns null for missing required fields', () => {
    expect(validateSSEEvent({ type: 'assistant.text.delta' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(validateSSEEvent('not an object')).toBeNull();
    expect(validateSSEEvent(null)).toBeNull();
    expect(validateSSEEvent(42)).toBeNull();
  });
});
