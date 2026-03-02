import { describe, expect, it } from 'vitest';
import { lowerPlannedLayoutToDrawBatch } from '@/lib/whiteboard/planner';
import type { PlannedSemanticLayout } from '@/lib/whiteboard/planner';

describe('planner lowerer', () => {
  it('converts planned layout to draw batch preserving id/preset/elements', () => {
    const planned: PlannedSemanticLayout = {
      batchId: 'sem-batch',
      stylePreset: 'clean_pen_sketch',
      templateUsed: 'freeform_semantic',
      elements: [{ id: 't1', type: 'text', x: 10, y: 20, text: 'hello' }],
      anchors: [],
      warnings: [],
      semanticBatch: {
        batch_id: 'sem-batch',
        template: 'freeform_semantic',
        blocks: [{ id: 'c1', kind: 'caption', text: 'hello' }],
      },
    };

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.batch_id).toBe('sem-batch');
    expect(draw.style_preset).toBe('clean_pen_sketch');
    expect(draw.elements).toHaveLength(1);
  });

  it('deduplicates elements by id keeping last occurrence', () => {
    const planned: PlannedSemanticLayout = {
      batchId: 'dedup-test',
      stylePreset: 'clean_pen_sketch',
      templateUsed: 'freeform_semantic',
      elements: [
        { id: 't1', type: 'text', x: 10, y: 20, text: 'first' },
        { id: 't1', type: 'text', x: 10, y: 30, text: 'second' },
      ],
      anchors: [],
      warnings: [],
      semanticBatch: {
        batch_id: 'dedup-test',
        template: 'freeform_semantic',
        blocks: [{ id: 'c1', kind: 'caption', text: 'hello' }],
      },
    };

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements).toHaveLength(1);
    if (draw.elements[0]?.type === 'text') {
      expect(draw.elements[0].text).toBe('second');
    }
  });

  it('sorts elements by draw order: shapes → arrows → text', () => {
    const planned: PlannedSemanticLayout = {
      batchId: 'order-test',
      stylePreset: 'clean_pen_sketch',
      templateUsed: 'freeform_semantic',
      elements: [
        { id: 't1', type: 'text', x: 10, y: 20, text: 'hello' },
        { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
        { id: 'r1', type: 'rect', x: 100, y: 100, w: 50, h: 50 },
      ],
      anchors: [],
      warnings: [],
      semanticBatch: {
        batch_id: 'order-test',
        template: 'freeform_semantic',
        blocks: [{ id: 'c1', kind: 'caption', text: 'hello' }],
      },
    };

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements[0]!.type).toBe('rect');
    expect(draw.elements[1]!.type).toBe('arrow');
    expect(draw.elements[2]!.type).toBe('text');
  });
});
