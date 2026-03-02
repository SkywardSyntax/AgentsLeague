import { describe, expect, it } from 'vitest';
import {
  normalizeDrawBatchPayload,
  normalizeSemanticBatchPayload,
  DrawBatchSchema,
  SemanticBatchSchema,
} from '@/lib/schema';

describe('normalizeSemanticBatchPayload', () => {
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
