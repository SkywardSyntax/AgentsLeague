import { describe, expect, it } from 'vitest';
import { normalizeBatchTextSpacingAgainstScene } from '@/lib/whiteboard/layout-spacing';
import type { DrawBatch, StrokeTrajectory } from '@/types/agent';

function stroke(id: string, elementId: string, points: Array<{ x: number; y: number }>): StrokeTrajectory {
  return {
    id,
    elementId,
    points,
    color: '#111',
    baseWidth: 1.6,
  };
}

describe('normalizeBatchTextSpacingAgainstScene', () => {
  it('pushes a new text/latex group below existing scene overlap', () => {
    const batch: DrawBatch = {
      batch_id: 'b1',
      elements: [{ id: 'eq-new', type: 'latex', x: 60, y: 170, tex: 'x=1' }],
    };

    const scene: StrokeTrajectory[] = [
      stroke('s1', 'eq-old', [
        { x: 50, y: 120 },
        { x: 260, y: 120 },
        { x: 260, y: 190 },
        { x: 50, y: 190 },
      ]),
    ];

    const fresh: StrokeTrajectory[] = [
      stroke('n1', 'eq-new', [
        { x: 60, y: 170 },
        { x: 220, y: 170 },
        { x: 220, y: 210 },
        { x: 60, y: 210 },
      ]),
    ];

    normalizeBatchTextSpacingAgainstScene(batch, fresh, scene);

    const minY = Math.min(...fresh[0]!.points.map((p) => p.y));
    expect(minY).toBeGreaterThanOrEqual(202);
  });

  it('treats a prior formula as one blocker region instead of per-stroke gaps', () => {
    const batch: DrawBatch = {
      batch_id: 'b2',
      elements: [{ id: 'label-new', type: 'text', x: 140, y: 120, text: 'label', size: 16 }],
    };

    const scene: StrokeTrajectory[] = [
      stroke('s-left', 'eq-old', [
        { x: 50, y: 90 },
        { x: 120, y: 90 },
        { x: 120, y: 140 },
        { x: 50, y: 140 },
      ]),
      stroke('s-right', 'eq-old', [
        { x: 220, y: 90 },
        { x: 290, y: 90 },
        { x: 290, y: 140 },
        { x: 220, y: 140 },
      ]),
    ];

    const fresh: StrokeTrajectory[] = [
      stroke('n-gap', 'label-new', [
        { x: 140, y: 120 },
        { x: 200, y: 120 },
        { x: 200, y: 150 },
        { x: 140, y: 150 },
      ]),
    ];

    normalizeBatchTextSpacingAgainstScene(batch, fresh, scene);

    const minY = Math.min(...fresh[0]!.points.map((p) => p.y));
    expect(minY).toBeGreaterThanOrEqual(154);
  });
});
