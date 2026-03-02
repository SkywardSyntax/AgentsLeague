import { describe, expect, it } from 'vitest';
import {
  cumulativeLengths,
  totalLength,
  partialPolylineByLength,
  distance,
} from '@/lib/whiteboard/geometry';
import {
  createActiveBatch,
  easeOutCubic,
  weightedVisibleLength,
} from '@/lib/whiteboard/stroke-scheduler';
import type { StrokeTrajectory } from '@/types/agent';

function straightStroke(length: number): StrokeTrajectory {
  return {
    id: 'test-stroke',
    elementId: 'test-element',
    points: [
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ],
    color: '#000',
    baseWidth: 1,
  };
}

function multiPointStroke(): StrokeTrajectory {
  return {
    id: 'multi-stroke',
    elementId: 'multi-element',
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 60, y: 0 },
      { x: 100, y: 0 },
    ],
    color: '#000',
    baseWidth: 1,
  };
}

describe('scheduler ↔ geometry integration', () => {
  it('progress accuracy: straight stroke at t=0.5 reveals 50% of length', () => {
    const stroke = straightStroke(100);
    const batch = createActiveBatch([stroke], 0);
    const active = batch[0]!;

    const visLen = partialPolylineByLength(
      active.points,
      active.cumulativeLengths,
      active.length * 0.5,
    );

    // Partial polyline should end at x=50 ± 1
    const lastPt = visLen[visLen.length - 1]!;
    expect(lastPt.x).toBeCloseTo(50, 0);
    expect(lastPt.y).toBeCloseTo(0, 5);
  });

  it('easing consistency: easeOutCubic progress maps to correct sub-polyline', () => {
    const stroke = multiPointStroke();
    const batch = createActiveBatch([stroke], 0);
    const active = batch[0]!;

    const easedT = easeOutCubic(0.25);
    const visibleLength = active.length * easedT;
    const partial = partialPolylineByLength(
      active.points,
      active.cumulativeLengths,
      visibleLength,
    );

    // easeOutCubic(0.25) ≈ 0.578125
    // visibleLength ≈ 57.8 for a 100px stroke
    const lastPt = partial[partial.length - 1]!;
    expect(lastPt.x).toBeCloseTo(visibleLength, 0);
    expect(lastPt.y).toBeCloseTo(0, 5);
  });

  it('weighted progress maps correctly through weightedVisibleLength', () => {
    const stroke = multiPointStroke();
    const batch = createActiveBatch([stroke], 0);
    const active = batch[0]!;

    // At t=0.5 with uniform speed factors (straight line), should be ~50%
    const wLen = weightedVisibleLength(
      active.cumulativeLengths,
      active.speedFactors ?? active.points.map(() => 1),
      0.5,
    );

    // For straight-line segments with all factors near 1, should be ~50 of 100
    expect(wLen).toBeGreaterThan(40);
    expect(wLen).toBeLessThan(60);
    expect(wLen).toBeLessThanOrEqual(active.length);
  });

  it('weightedVisibleLength never exceeds totalLength', () => {
    const stroke = multiPointStroke();
    const batch = createActiveBatch([stroke], 0);
    const active = batch[0]!;
    const factors = active.speedFactors ?? active.points.map(() => 1);

    for (let t = 0; t <= 1; t += 0.01) {
      const wLen = weightedVisibleLength(
        active.cumulativeLengths,
        factors,
        t,
      );
      expect(wLen).toBeLessThanOrEqual(active.length);
      expect(wLen).toBeGreaterThanOrEqual(0);
    }
  });

  it('cumulativeLengths matches totalLength for scheduled strokes', () => {
    const strokes = [straightStroke(100), multiPointStroke()];
    const batch = createActiveBatch(strokes, 0);

    for (const active of batch) {
      const cumLen = active.cumulativeLengths;
      const lastCum = cumLen[cumLen.length - 1] ?? 0;
      expect(lastCum).toBeCloseTo(active.length, 10);
      expect(cumLen.length).toBe(active.points.length);
    }
  });

  it('empty stroke: filtered out by createActiveBatch (needs >= 2 points)', () => {
    const emptyStroke: StrokeTrajectory = {
      id: 'empty',
      elementId: 'empty-el',
      points: [],
      color: '#000',
      baseWidth: 1,
    };
    const batch = createActiveBatch([emptyStroke], 0);
    expect(batch).toEqual([]);
  });

  it('single-point stroke: filtered out by createActiveBatch (needs >= 2 points)', () => {
    const singlePoint: StrokeTrajectory = {
      id: 'single',
      elementId: 'single-el',
      points: [{ x: 5, y: 10 }],
      color: '#000',
      baseWidth: 1,
    };
    const batch = createActiveBatch([singlePoint], 0);
    expect(batch).toEqual([]);
  });

  it('post-shift stability: shifted strokes maintain length consistency', () => {
    const stroke = multiPointStroke();
    const originalLen = totalLength(stroke.points);

    // Simulate shiftStrokes by adding offset
    const dx = 50;
    const dy = 30;
    const shifted: StrokeTrajectory = {
      ...stroke,
      points: stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };

    const shiftedLen = totalLength(shifted.points);
    expect(shiftedLen).toBeCloseTo(originalLen, 10);

    // Schedule the shifted stroke
    const batch = createActiveBatch([shifted], 0);
    const active = batch[0]!;
    expect(active.length).toBeCloseTo(originalLen, 10);

    // Cumulative lengths should also match
    const cumLen = cumulativeLengths(shifted.points);
    expect(cumLen).toEqual(active.cumulativeLengths);
  });

  it('full pipeline: create batch → eased progress → partial polyline → valid output', () => {
    const stroke: StrokeTrajectory = {
      id: 'pipe-test',
      elementId: 'pipe-el',
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
      ],
      color: '#000',
      baseWidth: 1,
    };

    const batch = createActiveBatch([stroke], 0);
    const active = batch[0]!;
    const tValues = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

    let prevLen = 0;
    for (const t of tValues) {
      const easedT = easeOutCubic(t);
      const visLen = active.length * easedT;
      const partial = partialPolylineByLength(
        active.points,
        active.cumulativeLengths,
        visLen,
      );

      // Partial polyline must have at least 1 point and all finite coords
      expect(partial.length).toBeGreaterThanOrEqual(1);
      for (const pt of partial) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }

      // Visible length should be monotonically non-decreasing
      const actualLen = totalLength(partial);
      expect(actualLen).toBeGreaterThanOrEqual(prevLen - 0.01);
      prevLen = actualLen;
    }
  });
});
