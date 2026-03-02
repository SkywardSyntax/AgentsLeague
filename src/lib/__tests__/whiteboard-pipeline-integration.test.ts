import { describe, expect, it } from 'vitest';
import { compileBatchToStrokes, strokesBounds } from '@/lib/whiteboard/semantic-to-strokes';
import { normalizeBatchTextSpacingAgainstScene } from '@/lib/whiteboard/layout-spacing';
import type { DrawBatch, StrokeTrajectory } from '@/types/agent';

/**
 * Integration tests for the compileBatchToStrokes → normalizeBatchTextSpacingAgainstScene
 * pipeline, verifying that consecutive batches are spaced correctly when the first
 * batch's strokes serve as sceneStrokes for the second.
 */

function groupBounds(strokes: StrokeTrajectory[]): Map<string, { minX: number; minY: number; maxX: number; maxY: number }> {
  const groups = new Map<string, StrokeTrajectory[]>();
  for (const s of strokes) {
    const list = groups.get(s.elementId);
    if (list) list.push(s);
    else groups.set(s.elementId, [s]);
  }
  const result = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
  for (const [id, grp] of groups) {
    const b = strokesBounds(grp);
    if (b) result.set(id, b);
  }
  return result;
}

describe('compileBatchToStrokes → layout-spacing pipeline', () => {
  it(
    'spaces consecutive text+rect batches without vertical overlap',
    async () => {
      const batch1: DrawBatch = {
        batch_id: 'pipeline-b1',
        elements: [
          { id: 'title1', type: 'text', x: 60, y: 80, text: 'First Title', size: 20 },
          { id: 'box1', type: 'rect', x: 60, y: 120, w: 200, h: 60 },
        ],
      };

      const result1 = await compileBatchToStrokes(batch1);
      const sceneStrokes = result1.strokes;

      const batch2: DrawBatch = {
        batch_id: 'pipeline-b2',
        elements: [
          { id: 'title2', type: 'text', x: 60, y: 130, text: 'Second Title', size: 20 },
          { id: 'eq2', type: 'latex', x: 60, y: 170, tex: 'E=mc^2' },
        ],
      };

      const result2 = await compileBatchToStrokes(batch2);
      normalizeBatchTextSpacingAgainstScene(batch2, result2.strokes, sceneStrokes);

      const bounds1 = groupBounds(sceneStrokes);
      const bounds2 = groupBounds(result2.strokes);

      // Every group in batch 2 that horizontally overlaps a batch 1 group
      // must have at least 14px vertical clearance
      for (const [, b2] of bounds2) {
        for (const [, b1] of bounds1) {
          const hOverlap = Math.max(0, Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX));
          if (hOverlap >= 14) {
            expect(b2.minY).toBeGreaterThanOrEqual(b1.maxY + 14 - 1); // -1 for FP tolerance
          }
        }
      }
    },
    30_000,
  );

  it(
    'compiles all element types and verifies no NaN coordinates after spacing',
    async () => {
      const batch: DrawBatch = {
        batch_id: 'pipeline-all-types',
        elements: [
          { id: 'r1', type: 'rect', x: 40, y: 40, w: 100, h: 50 },
          { id: 'e1', type: 'ellipse', cx: 250, cy: 80, rx: 40, ry: 30 },
          { id: 'a1', type: 'arrow', from: { x: 350, y: 60 }, to: { x: 450, y: 60 } },
          { id: 't1', type: 'text', x: 40, y: 120, text: 'Hello World', size: 18 },
          { id: 'l1', type: 'latex', x: 40, y: 170, tex: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}' },
        ],
      };

      const result = await compileBatchToStrokes(batch);
      normalizeBatchTextSpacingAgainstScene(batch, result.strokes, []);

      expect(result.strokes.length).toBeGreaterThan(0);

      for (const stroke of result.strokes) {
        for (const point of stroke.points) {
          expect(Number.isFinite(point.x)).toBe(true);
          expect(Number.isFinite(point.y)).toBe(true);
        }
      }

      // Verify text/latex groups have ≥14px vertical clearance from each other
      const textGroups = groupBounds(
        result.strokes.filter((s) => s.elementId.startsWith('t1') || s.elementId.startsWith('l1')),
      );
      const entries = [...textGroups.values()].sort((a, b) => a.minY - b.minY);
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i]!.minY).toBeGreaterThanOrEqual(entries[i - 1]!.maxY + 14 - 1);
      }
    },
    30_000,
  );

  it(
    'handles stress test with >50 committed scene strokes efficiently',
    async () => {
      // Build scene strokes programmatically: 60 rect strokes spread vertically
      const sceneStrokes: StrokeTrajectory[] = [];
      for (let i = 0; i < 60; i++) {
        const y = i * 25;
        sceneStrokes.push({
          id: `scene-${i}`,
          elementId: `scene-el-${i}`,
          color: '#000',
          baseWidth: 1.4,
          points: [
            { x: 40, y },
            { x: 240, y },
            { x: 240, y: y + 20 },
            { x: 40, y: y + 20 },
          ],
        });
      }

      const newBatch: DrawBatch = {
        batch_id: 'stress-batch',
        elements: [
          { id: 'stress-txt', type: 'text', x: 40, y: 100, text: 'Stress test text', size: 16 },
        ],
      };

      const start = performance.now();
      const result = await compileBatchToStrokes(newBatch);
      normalizeBatchTextSpacingAgainstScene(newBatch, result.strokes, sceneStrokes);
      const elapsed = performance.now() - start;

      // Sanity: should complete in reasonable time (not O(n^3) blowup)
      expect(elapsed).toBeLessThan(5000);
      expect(result.strokes.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
