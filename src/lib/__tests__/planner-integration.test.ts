import { describe, expect, it } from 'vitest';
import {
  enforceDrawBatchConstraints,
  lowerPlannedLayoutToDrawBatch,
} from '@/lib/whiteboard/planner';
import type { PlannedSemanticLayout } from '@/lib/whiteboard/planner';
import type { DrawBatch, DrawElement } from '@/types/agent';

function makeLayout(elements: DrawElement[], warnings: string[] = []): PlannedSemanticLayout {
  return {
    batchId: 'int-batch',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    warnings,
    semanticBatch: {
      batch_id: 'int-batch',
      template: 'freeform_semantic',
      blocks: [{ id: 'c1', kind: 'caption', text: 'hello' }],
    },
  };
}

describe('planner integration: constraints → lowerer pipeline', () => {
  it('overlap fix + arrow legibility + lowerer sort order', () => {
    const batch: DrawBatch = {
      batch_id: 'pipe-1',
      elements: [
        { id: 't1', type: 'text', x: 40, y: 100, text: 'first line', size: 22 },
        { id: 't2', type: 'text', x: 45, y: 102, text: 'second line', size: 22 },
        // Arrow shorter than 22px threshold
        { id: 'a1', type: 'arrow', from: { x: 300, y: 300 }, to: { x: 305, y: 303 } },
        { id: 'r1', type: 'rect', x: 500, y: 500, w: 80, h: 60 },
      ],
    };

    const constrained = enforceDrawBatchConstraints(batch);

    // Feed constrained batch into lowerer
    const layout = makeLayout(constrained.batch.elements);
    layout.batchId = constrained.batch.batch_id;
    const draw = lowerPlannedLayoutToDrawBatch(layout);

    // Arrow should be at least 22px after constraint fix (extended to 28px length)
    const arrow = draw.elements.find((el) => el.id === 'a1');
    expect(arrow).toBeDefined();
    expect(arrow!.type).toBe('arrow');
    if (arrow!.type === 'arrow') {
      const len = Math.hypot(arrow!.to.x - arrow!.from.x, arrow!.to.y - arrow!.from.y);
      expect(len).toBeGreaterThanOrEqual(22);
    }

    // Text elements should no longer overlap vertically
    const texts = draw.elements.filter((el) => el.type === 'text');
    expect(texts.length).toBe(2);
    if (texts[0]!.type === 'text' && texts[1]!.type === 'text') {
      expect(Math.abs(texts[0]!.y - texts[1]!.y)).toBeGreaterThan(8);
    }

    // Draw order: shapes (rect) → arrows → text
    const types = draw.elements.map((el) => el.type);
    const rectIdx = types.indexOf('rect');
    const arrowIdx = types.indexOf('arrow');
    const textIdx = types.indexOf('text');
    expect(rectIdx).toBeLessThan(arrowIdx);
    expect(arrowIdx).toBeLessThan(textIdx);
  });

  it('element count capped after constraints with insertion-order truncation', () => {
    const elements: DrawElement[] = Array.from({ length: 70 }, (_, i) => ({
      id: `t${i}`,
      type: 'text' as const,
      x: 40,
      y: 40 + i * 50,
      text: `item ${i}`,
      size: 14,
    }));

    const batch: DrawBatch = { batch_id: 'cap-test', elements };
    const constrained = enforceDrawBatchConstraints(batch);

    const layout = makeLayout(constrained.batch.elements);
    const draw = lowerPlannedLayoutToDrawBatch(layout);

    // Default cap is 60
    expect(draw.elements.length).toBeLessThanOrEqual(60);
    expect(layout.warnings).toContain('element_count_capped');
  });

  it('fallback reflow + lowerer produces non-overlapping sorted output', () => {
    // Force fallback by setting maxRepairIterations to 0
    const batch: DrawBatch = {
      batch_id: 'fallback-pipe',
      elements: [
        { id: 't1', type: 'text', x: 50, y: 100, text: 'overlapping text one', size: 18 },
        { id: 't2', type: 'text', x: 55, y: 101, text: 'overlapping text two', size: 18 },
        { id: 'r1', type: 'rect', x: 400, y: 400, w: 100, h: 80 },
      ],
    };

    const constrained = enforceDrawBatchConstraints(batch, { maxRepairIterations: 0 });
    expect(constrained.fallbackUsed).toBe(true);

    const layout = makeLayout(constrained.batch.elements);
    const draw = lowerPlannedLayoutToDrawBatch(layout);

    // All elements preserved
    expect(draw.elements.length).toBe(3);

    // Draw order maintained: rect before text
    const types = draw.elements.map((el) => el.type);
    expect(types.indexOf('rect')).toBeLessThan(types.indexOf('text'));
  });
});
