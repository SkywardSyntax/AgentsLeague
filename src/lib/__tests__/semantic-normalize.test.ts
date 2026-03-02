import { describe, expect, it } from 'vitest';
import {
  normalizeDrawBatchPayload,
  normalizeSemanticBatchPayload,
  DrawBatchSchema,
  SemanticBatchSchema,
} from '@/lib/schema';

describe('normalizeSemanticBatchPayload', () => {
  it('defaults to freeform_semantic for invalid template', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'sem-t1',
      template: 'nonexistent_template',
      blocks: [{ id: 'eq-1', kind: 'equation_stack', lines: [{ id: 'l1', tex: 'x=1' }] }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.template).toBe('freeform_semantic');
    expect(warnings.some((w) => w.includes('template'))).toBe(true);
  });

  it('drops invalid region_hint for caption block', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'sem-t2',
      template: 'freeform_semantic',
      blocks: [{ id: 'cap-1', kind: 'caption', text: 'Some caption', region_hint: 'left' }],
    });
    expect(normalized).not.toBeNull();
    const block = normalized!.blocks[0];
    expect(block.kind).toBe('caption');
    if (block.kind === 'caption') {
      expect(block.region_hint).toBeUndefined();
    }
  });

  it('returns null when blocks array is empty', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'sem-t3',
      template: 'freeform_semantic',
      blocks: [],
    });
    expect(normalized).toBeNull();
    expect(warnings.some((w) => w.includes('No valid semantic blocks'))).toBe(true);
  });

  it('drops relations with invalid type while keeping valid ones', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'sem-t4',
      template: 'freeform_semantic',
      blocks: [
        { id: 'eq-1', kind: 'equation_stack', lines: [{ id: 'l1', tex: 'x=1' }] },
        { id: 'eq-2', kind: 'equation_stack', lines: [{ id: 'l2', tex: 'y=2' }] },
      ],
      relations: [
        { id: 'r1', type: 'invalid_type', from_block_id: 'eq-1', to_block_id: 'eq-2' },
        { id: 'r2', type: 'maps_to', from_block_id: 'eq-1', to_block_id: 'eq-2' },
      ],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.relations).toHaveLength(1);
    expect(normalized!.relations![0].type).toBe('maps_to');
  });

  it('drops invalid style_preset with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'sem-t5',
      template: 'freeform_semantic',
      style_preset: 'invalid_preset',
      blocks: [{ id: 'eq-1', kind: 'equation_stack', lines: [{ id: 'l1', tex: 'x=1' }] }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.style_preset).toBeUndefined();
    expect(warnings.some((w) => w.includes('style_preset'))).toBe(true);
  });

  it('drops invalid intent with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'sem-t6',
      template: 'freeform_semantic',
      intent: 'invalid_intent',
      blocks: [{ id: 'eq-1', kind: 'equation_stack', lines: [{ id: 'l1', tex: 'x=1' }] }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.intent).toBeUndefined();
    expect(warnings.some((w) => w.includes('intent'))).toBe(true);
  });

  it('repairs out-of-range relative_pose values to pass semantic schema', () => {
    const raw = {
      batch_id: 'sem-norm-1',
      template: 'jacobian_mapping_2panel',
      blocks: [
        {
          id: 'panel-1',
          kind: 'diagram_panel',
          shapes: [
            {
              id: 'shape-1',
              type: 'parallelogram',
              relative_pose: {
                x: -0.4,
                y: 1.8,
                w: -0.2,
                h: 2.2,
              },
            },
          ],
        },
      ],
    };

    const normalized = normalizeSemanticBatchPayload(raw);
    expect(normalized.normalized).not.toBeNull();
    expect(normalized.warnings.some((w) => w.includes('clamped'))).toBe(true);

    const parsed = SemanticBatchSchema.safeParse(normalized.normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const block = parsed.data.blocks[0];
    expect(block.kind).toBe('diagram_panel');
    if (block.kind !== 'diagram_panel') return;

    const pose = block.shapes?.[0]?.relative_pose;
    expect(pose).toBeDefined();
    expect(pose?.x).toBeGreaterThanOrEqual(0);
    expect(pose?.x).toBeLessThanOrEqual(1);
    expect(pose?.y).toBeGreaterThanOrEqual(0);
    expect(pose?.y).toBeLessThanOrEqual(1);
  });
});

describe('normalizeDrawBatchPayload → DrawBatchSchema contract', () => {
  it('normalized output passes schema validation for valid input', () => {
    const raw = {
      batch_id: 'contract-draw',
      elements: [
        { id: 'r1', type: 'rect', x: '10', y: '20', w: '30', h: '40' },
        { id: 't1', type: 'text', x: 50, y: 60, text: 'hello', size: 18 },
      ],
    };
    const { normalized } = normalizeDrawBatchPayload(raw);
    expect(normalized).not.toBeNull();
    const parsed = DrawBatchSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
  });

  it('normalized output passes schema for elements with string-typed numbers', () => {
    const raw = {
      batch_id: 'contract-coerce',
      elements: [
        { id: 'e1', type: 'ellipse', cx: '100', cy: '200', rx: '50', ry: '30' },
      ],
    };
    const { normalized } = normalizeDrawBatchPayload(raw);
    expect(normalized).not.toBeNull();
    const parsed = DrawBatchSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const el = parsed.data.elements[0]!;
      expect(el.type).toBe('ellipse');
      if (el.type === 'ellipse') {
        expect(typeof el.cx).toBe('number');
      }
    }
  });
});
