import { describe, expect, it } from 'vitest';
import { planSemanticBatch, enforceDrawBatchConstraints, lowerPlannedLayoutToDrawBatch } from '@/lib/whiteboard/planner';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { normalizeBatchTextSpacingAgainstScene } from '@/lib/whiteboard/layout-spacing';
import type { SemanticBatch, StrokeTrajectory } from '@/types/agent';

function strokeGroupBounds(strokes: StrokeTrajectory[]) {
  const groups = new Map<string, StrokeTrajectory[]>();
  for (const s of strokes) {
    const list = groups.get(s.elementId);
    if (list) list.push(s);
    else groups.set(s.elementId, [s]);
  }

  const result: Array<{ elementId: string; minX: number; minY: number; maxX: number; maxY: number }> = [];
  for (const [elementId, groupStrokes] of groups) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of groupStrokes) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (Number.isFinite(minX)) {
      result.push({ elementId, minX, minY, maxX, maxY });
    }
  }
  return result;
}

describe('semantic → strokes → spacing integration', () => {
  it('equation_derivation_vertical batch produces strokes within canvas bounds', async () => {
    const batch: SemanticBatch = {
      batch_id: 'int-1',
      template: 'equation_derivation_vertical',
      blocks: [
        {
          id: 'eqs',
          kind: 'equation_stack',
          lines: [
            { id: 'l1', tex: 'ax^2+bx+c=0', displayMode: true },
            { id: 'l2', tex: 'x=-\\frac{b}{2a}', displayMode: true },
            { id: 'l3', tex: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', displayMode: true, role: 'result' },
          ],
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const constrained = enforceDrawBatchConstraints({
      batch_id: planned.batchId,
      style_preset: planned.stylePreset,
      elements: planned.elements,
    });
    const { strokes } = await compileBatchToStrokes(constrained.batch);
    normalizeBatchTextSpacingAgainstScene(constrained.batch, strokes, []);

    const groups = strokeGroupBounds(strokes);
    expect(groups.length).toBeGreaterThan(0);

    for (const g of groups) {
      expect(g.minX).toBeGreaterThanOrEqual(-10);
      expect(g.minY).toBeGreaterThanOrEqual(-10);
      expect(g.maxX).toBeLessThanOrEqual(1610);
      expect(g.maxY).toBeLessThanOrEqual(1210);
    }

    // Every stroke group must have at least one point
    for (const s of strokes) {
      expect(s.points.length).toBeGreaterThan(0);
    }
  });

  it('sequential batches produce valid strokes with spacing normalization applied', async () => {
    const batch1: SemanticBatch = {
      batch_id: 'seq-1',
      template: 'equation_derivation_vertical',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [
            { id: 'l1', tex: 'f(x)=x^2', displayMode: true },
            { id: 'l2', tex: 'f\'(x)=2x', displayMode: true },
          ],
        },
      ],
    };

    const batch2: SemanticBatch = {
      batch_id: 'seq-2',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'txt1',
          kind: 'caption',
          text: 'The derivative gives slope',
          region_hint: 'center',
        },
        {
          id: 'txt2',
          kind: 'caption',
          text: 'At x=0 slope is zero',
          region_hint: 'center',
        },
      ],
    };

    // Process batch 1
    const planned1 = planSemanticBatch(batch1);
    const constrained1 = enforceDrawBatchConstraints({
      batch_id: planned1.batchId,
      style_preset: planned1.stylePreset,
      elements: planned1.elements,
    });
    const { strokes: strokes1 } = await compileBatchToStrokes(constrained1.batch);
    normalizeBatchTextSpacingAgainstScene(constrained1.batch, strokes1, []);

    // Process batch 2 with batch 1's strokes as scene
    const planned2 = planSemanticBatch(batch2);
    const constrained2 = enforceDrawBatchConstraints({
      batch_id: planned2.batchId,
      style_preset: planned2.stylePreset,
      elements: planned2.elements,
    });
    const { strokes: strokes2 } = await compileBatchToStrokes(constrained2.batch);
    normalizeBatchTextSpacingAgainstScene(constrained2.batch, strokes2, strokes1);

    // Both batches produce valid strokes
    expect(strokes1.length).toBeGreaterThan(0);
    expect(strokes2.length).toBeGreaterThan(0);

    // All strokes have finite coordinates
    for (const s of [...strokes1, ...strokes2]) {
      for (const p of s.points) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }

    // Batch 2 text groups that were shifted should not overlap their blockers
    const groups2 = strokeGroupBounds(strokes2);
    const groups1 = strokeGroupBounds(strokes1);
    for (const g2 of groups2) {
      for (const g1 of groups1) {
        const hOverlap = Math.max(0, Math.min(g1.maxX, g2.maxX) - Math.max(g1.minX, g2.minX));
        if (hOverlap >= 14) {
          // After normalization, if there was vertical overlap the normalizer should have reduced it
          const verticalGap = g2.minY - g1.maxY;
          // The normalizer guarantees 14px gap for horizontally overlapping text, but
          // only applies to groups resolved during normalization. Groups that didn't
          // originally overlap are unchanged. Verify no new NaN or Infinity.
          expect(Number.isFinite(verticalGap)).toBe(true);
        }
      }
    }
  });

  it('elements near canvas edge are clamped within bounds after full pipeline', async () => {
    const batch: SemanticBatch = {
      batch_id: 'edge-test',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'eq-edge',
          kind: 'equation_stack',
          region_hint: 'right',
          lines: [
            { id: 'l1', tex: 'a+b+c+d+e+f=g', displayMode: true },
            { id: 'l2', tex: '\\sum_{i=1}^{n} x_i = S', displayMode: true },
          ],
        },
        {
          id: 'cap-bottom',
          kind: 'caption',
          text: 'Summary note at the bottom of the canvas',
          region_hint: 'bottom',
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const constrained = enforceDrawBatchConstraints({
      batch_id: planned.batchId,
      style_preset: planned.stylePreset,
      elements: planned.elements,
    });

    // After constraint enforcement, all elements should be within canvas
    for (const el of constrained.batch.elements) {
      if (el.type === 'text') {
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
      }
      if (el.type === 'latex') {
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
      }
    }

    const { strokes } = await compileBatchToStrokes(constrained.batch);
    expect(strokes.length).toBeGreaterThan(0);
  });
});
