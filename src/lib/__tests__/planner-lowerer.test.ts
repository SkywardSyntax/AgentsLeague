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
});
