import { describe, expect, it } from 'vitest';
import { normalizeBatchTextSpacingAgainstScene } from '@/lib/whiteboard/layout-spacing';
import type { DrawBatch, StrokeTrajectory } from '@/types/agent';

function makeStroke(
  elementId: string,
  x: number,
  y: number,
): StrokeTrajectory {
  return {
    id: `${elementId}-stroke`,
    elementId,
    points: [
      { x, y },
      { x: x + 40, y: y + 20 },
    ],
    color: '#000',
    baseWidth: 1,
  };
}

describe('normalizeBatchTextSpacingAgainstScene — dedup / idempotency', () => {
  it('normalizing same batch against same scene twice produces identical result', () => {
    const batch: DrawBatch = {
      batch_id: 'b1',
      elements: [{ id: 't1', type: 'text', x: 100, y: 100, text: 'hello', size: 16 }],
    };
    const sceneStrokes: StrokeTrajectory[] = [makeStroke('s1', 100, 90)];

    const batchStrokes1: StrokeTrajectory[] = [makeStroke('t1', 100, 100)];
    normalizeBatchTextSpacingAgainstScene(batch, batchStrokes1, sceneStrokes);
    const y1 = batchStrokes1[0]!.points[0]!.y;

    const batchStrokes2: StrokeTrajectory[] = [makeStroke('t1', 100, 100)];
    normalizeBatchTextSpacingAgainstScene(batch, batchStrokes2, sceneStrokes);
    const y2 = batchStrokes2[0]!.points[0]!.y;

    expect(y1).toBe(y2);
  });

  it('empty batch strokes — no mutation, no throw', () => {
    const batch: DrawBatch = {
      batch_id: 'b-empty',
      elements: [{ id: 't1', type: 'text', x: 50, y: 50, text: 'hi', size: 14 }],
    };
    const sceneStrokes: StrokeTrajectory[] = [makeStroke('s1', 50, 40)];
    const origSceneY = sceneStrokes[0]!.points[0]!.y;

    normalizeBatchTextSpacingAgainstScene(batch, [], sceneStrokes);

    expect(sceneStrokes[0]!.points[0]!.y).toBe(origSceneY);
  });

  it('batch strokes with no text-like elements — no mutation', () => {
    const rectBatch: DrawBatch = {
      batch_id: 'b2',
      elements: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
    };
    const rectStrokes: StrokeTrajectory[] = [makeStroke('r1', 0, 0)];
    const origY = rectStrokes[0]!.points[0]!.y;
    const sceneStrokes: StrokeTrajectory[] = [makeStroke('s1', 0, 0)];

    normalizeBatchTextSpacingAgainstScene(rectBatch, rectStrokes, sceneStrokes);

    expect(rectStrokes[0]!.points[0]!.y).toBe(origY);
  });
});
