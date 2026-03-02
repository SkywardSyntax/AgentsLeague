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

describe('normalization boundaries', () => {
  const makeBlocks = (...ids: string[]) =>
    ids.map((id) => ({ id, kind: 'caption', text: `Block ${id}` }));

  it('exactly 100 relations: no truncation warning', () => {
    const blocks = makeBlocks('a', 'b');
    const relations = Array.from({ length: 100 }, (_, i) => ({
      id: `r${i}`,
      type: 'maps_to',
      from_block_id: 'a',
      to_block_id: 'b',
    }));
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks,
      relations,
    });
    expect(warnings.filter((w) => w.includes('truncated'))).toHaveLength(0);
    expect(normalized!.relations).toHaveLength(100);
  });

  it('101 relations: truncated to 100 with exactly 1 truncation warning', () => {
    const blocks = makeBlocks('a', 'b');
    const relations = Array.from({ length: 101 }, (_, i) => ({
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
    const truncWarnings = warnings.filter((w) => w.includes('truncated'));
    expect(truncWarnings).toHaveLength(1);
  });

  it('relative_pose {x:-0.5, y:1.5} clamped to {x:0, y:1}', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [
            {
              id: 's1',
              type: 'rect',
              relative_pose: { x: -0.5, y: 1.5 },
            },
          ],
        },
      ],
    });
    const shape = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(shape.shapes[0].relative_pose.x).toBe(0);
    expect(shape.shapes[0].relative_pose.y).toBe(1);
    expect(warnings.some((w) => w.includes('clamped'))).toBe(true);
  });

  it('relative_pose {x:0, y:0} passes through unchanged', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [
            {
              id: 's1',
              type: 'rect',
              relative_pose: { x: 0, y: 0 },
            },
          ],
        },
      ],
    });
    const shape = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(shape.shapes[0].relative_pose.x).toBe(0);
    expect(shape.shapes[0].relative_pose.y).toBe(0);
    expect(warnings.filter((w) => w.includes('clamped'))).toHaveLength(0);
  });

  it('relative_pose {x:1, y:1} passes through unchanged', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [
            {
              id: 's1',
              type: 'rect',
              relative_pose: { x: 1, y: 1 },
            },
          ],
        },
      ],
    });
    const shape = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(shape.shapes[0].relative_pose.x).toBe(1);
    expect(shape.shapes[0].relative_pose.y).toBe(1);
    expect(warnings.filter((w) => w.includes('clamped'))).toHaveLength(0);
  });

  it('deep 5-node cycle: only cycle-creating edge dropped, DAG edges preserved', () => {
    const blocks = makeBlocks('a', 'b', 'c', 'd', 'e');
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks,
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'a', to_block_id: 'b' },
        { id: 'r2', type: 'maps_to', from_block_id: 'b', to_block_id: 'c' },
        { id: 'r3', type: 'maps_to', from_block_id: 'c', to_block_id: 'd' },
        { id: 'r4', type: 'maps_to', from_block_id: 'd', to_block_id: 'e' },
        { id: 'r5', type: 'maps_to', from_block_id: 'e', to_block_id: 'a' }, // cycle
      ],
    });
    expect(normalized!.relations).toHaveLength(4);
    expect(normalized!.relations!.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(warnings.some((w) => w.includes('cycle'))).toBe(true);
  });

  it('all-self-reference batch: all dropped with per-relation warnings', () => {
    const blocks = makeBlocks('a');
    const relations = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      type: 'maps_to',
      from_block_id: 'a',
      to_block_id: 'a',
    }));
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks,
      relations,
    });
    const selfRefWarnings = warnings.filter((w) => w.includes('self-referencing'));
    expect(selfRefWarnings).toHaveLength(10);
    // No relations survived; normalized should omit relations key or have empty
    expect(normalized!.relations ?? []).toHaveLength(0);
  });

  it('empty blocks array returns null with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [],
    });
    expect(normalized).toBeNull();
    expect(warnings.some((w) => w.includes('No valid semantic blocks'))).toBe(true);
  });

  it('invalid shape type drops shape with warning (asEnum returns null)', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [
            { id: 's1', type: 'hexagon', label: 'Bad shape' },
            { id: 's2', type: 'rect', label: 'Good shape' },
          ],
        },
      ],
    });
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(panel.shapes).toHaveLength(1);
    expect(panel.shapes[0].type).toBe('rect');
    expect(warnings.some((w) => w.includes('invalid type'))).toBe(true);
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

  it('validates text.delta with empty string delta content', () => {
    const event = { type: 'assistant.text.delta', turnId: 't1', delta: '' };
    expect(validateSSEEvent(event)).toEqual(event);
  });

  it('validates whiteboard.batch with empty elements array', () => {
    const event = {
      type: 'whiteboard.batch',
      turnId: 't1',
      batch: { batch_id: 'b1', elements: [] },
    };
    expect(validateSSEEvent(event)).toBeTruthy();
  });
});

describe('relative_pose precision', () => {
  it('{x: -0.001, y: 1.001} clamped to {x: 0, y: 1}', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [{ id: 's1', type: 'rect', relative_pose: { x: -0.001, y: 1.001 } }],
        },
      ],
    });
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(panel.shapes[0].relative_pose.x).toBe(0);
    expect(panel.shapes[0].relative_pose.y).toBe(1);
    expect(warnings.some((w) => w.includes('clamped'))).toBe(true);
  });

  it('{x: 0.5, y: 0.5} passes through unchanged', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [{ id: 's1', type: 'rect', relative_pose: { x: 0.5, y: 0.5 } }],
        },
      ],
    });
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(panel.shapes[0].relative_pose.x).toBe(0.5);
    expect(panel.shapes[0].relative_pose.y).toBe(0.5);
    expect(warnings.filter((w) => w.includes('clamped'))).toHaveLength(0);
  });

  it('{x: 0.9999999999, y: 0.0000000001} passes through without clamping', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [{ id: 's1', type: 'rect', relative_pose: { x: 0.9999999999, y: 0.0000000001 } }],
        },
      ],
    });
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(panel.shapes[0].relative_pose.x).toBeCloseTo(0.9999999999);
    expect(panel.shapes[0].relative_pose.y).toBeCloseTo(0.0000000001);
    expect(warnings.filter((w) => w.includes('clamped'))).toHaveLength(0);
  });

  it('{x: NaN, y: 0.5} — NaN is sanitized via asNumber fallback to default 0.5', () => {
    // asNumber returns null for NaN; the normalizer falls back to 0.5
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [{ id: 's1', type: 'rect', relative_pose: { x: NaN, y: 0.5 } }],
        },
      ],
    });
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    // NaN filtered by asNumber → null → defaults to 0.5 via `x ?? 0.5`
    expect(panel.shapes[0].relative_pose.x).toBe(0.5);
    expect(panel.shapes[0].relative_pose.y).toBe(0.5);
  });

  it('{x: Infinity, y: -Infinity} — asNumber filters non-finite, no pose set', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [{ id: 's1', type: 'rect', relative_pose: { x: Infinity, y: -Infinity } }],
        },
      ],
    });
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    // asNumber returns null for non-finite → condition fails → no relative_pose set
    expect(panel.shapes[0].relative_pose).toBeUndefined();
  });
});

describe('enum coercion edge cases', () => {
  it('uppercase shape type (RECT) is dropped with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [
            { id: 's1', type: 'RECT', label: 'Bad shape' },
            { id: 's2', type: 'rect', label: 'Good shape' },
          ],
        },
      ],
    });
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(panel.shapes).toHaveLength(1);
    expect(panel.shapes[0].type).toBe('rect');
    expect(warnings.some((w) => w.includes('invalid type'))).toBe(true);
  });

  it('empty string shape type is dropped with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [
            { id: 's1', type: '', label: 'Empty type' },
            { id: 's2', type: 'rect', label: 'Good' },
          ],
        },
      ],
    });
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(panel.shapes).toHaveLength(1);
    expect(warnings.some((w) => w.includes('invalid type'))).toBe(true);
  });

  it('near-miss synonym shape type (rectangle) is dropped with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'p1',
          kind: 'diagram_panel',
          shapes: [{ id: 's1', type: 'rectangle', label: 'Near-miss' }],
        },
      ],
    });
    // diagram_panel with no valid shapes still gets added (shapes array empty)
    const panel = normalized!.blocks.find((b) => b.kind === 'diagram_panel') as any;
    expect(panel.shapes).toBeUndefined();
    expect(warnings.some((w) => w.includes('invalid type'))).toBe(true);
  });
});

describe('mass deduplication', () => {
  it('50 blocks with same id get unique suffixed ids with 49 warnings', () => {
    const blocks = Array.from({ length: 50 }, (_, i) => ({
      id: 'same',
      kind: 'caption',
      text: `Block ${i}`,
    }));
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks,
    });
    expect(normalized!.blocks).toHaveLength(50);
    const ids = normalized!.blocks.map((b) => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(50);
    const dupWarnings = warnings.filter((w) => w.includes('Duplicate block id'));
    expect(dupWarnings).toHaveLength(49);
  });

  it('block order is preserved after dedup', () => {
    const blocks = Array.from({ length: 5 }, (_, i) => ({
      id: 'dup',
      kind: 'caption',
      text: `Block ${i}`,
    }));
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks,
    });
    for (let i = 0; i < 5; i++) {
      expect((normalized!.blocks[i] as any).text).toBe(`Block ${i}`);
    }
  });
});

describe('relation target validation', () => {
  const makeBlocks = (...ids: string[]) =>
    ids.map((id) => ({ id, kind: 'caption', text: `Block ${id}` }));

  it('drops relation referencing non-existent from_block_id with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a', 'b'),
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'nonexistent', to_block_id: 'b' },
      ],
    });
    expect(normalized!.relations ?? []).toHaveLength(0);
    expect(warnings.some((w) => w.includes('non-existent'))).toBe(true);
  });

  it('drops relation referencing non-existent to_block_id with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a', 'b'),
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'a', to_block_id: 'ghost' },
      ],
    });
    expect(normalized!.relations ?? []).toHaveLength(0);
    expect(warnings.some((w) => w.includes('non-existent'))).toBe(true);
  });

  it('preserves valid relation with both existing block ids', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a', 'b'),
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'a', to_block_id: 'b' },
      ],
    });
    expect(normalized!.relations).toHaveLength(1);
    expect(warnings.filter((w) => w.includes('non-existent'))).toHaveLength(0);
  });

  it('drops relation where both endpoints reference non-existent blocks', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a', 'b'),
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'ghost1', to_block_id: 'ghost2' },
      ],
    });
    expect(normalized!.relations ?? []).toHaveLength(0);
    expect(warnings.some((w) => w.includes('non-existent'))).toBe(true);
  });

  it('empty relations array produces no errors', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: makeBlocks('a'),
      relations: [],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.relations ?? []).toHaveLength(0);
    expect(warnings.filter((w) => w.includes('relation'))).toHaveLength(0);
  });

  it('empty blocks with non-empty relations returns null and drops all', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [],
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'a', to_block_id: 'b' },
      ],
    });
    expect(normalized).toBeNull();
    expect(warnings.some((w) => w.includes('No valid semantic blocks'))).toBe(true);
  });
});
