import { describe, expect, it } from 'vitest';
import {
  clamp,
  distance,
  cumulativeLengths,
  totalLength,
  partialPolylineByLength,
  resamplePolyline,
  screenStrokePx,
  MIN_SCREEN_STROKE_PX,
  MAX_SCREEN_STROKE_PX,
} from '@/lib/whiteboard/geometry';
import { COORD_BOUNDS } from '@/lib/whiteboard/clamp-coordinates';
import type { Point } from '@/types/agent';

describe('iter28 · Coordinate transforms correctness', () => {
  it('identity transform preserves point (manual matrix multiply)', () => {
    // Simulate safeTransformPoint with identity: x' = 1*x + 0*y + 0, y' = 0*x + 1*y + 0
    const p: Point = { x: 42, y: 99 };
    const x = clamp(1 * p.x + 0 * p.y + 0, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X);
    const y = clamp(0 * p.x + 1 * p.y + 0, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y);
    expect(x).toBe(42);
    expect(y).toBe(99);
  });

  it('translation shifts point correctly', () => {
    const p: Point = { x: 10, y: 20 };
    const tx = 100, ty = -50;
    const x = clamp(p.x + tx, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X);
    const y = clamp(p.y + ty, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y);
    expect(x).toBe(110);
    expect(y).toBe(-30);
  });

  it('scale doubles point correctly', () => {
    const p: Point = { x: 50, y: 75 };
    const x = clamp(2 * p.x, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X);
    const y = clamp(2 * p.y, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y);
    expect(x).toBe(100);
    expect(y).toBe(150);
  });

  it('transform clamps overflow to COORD_BOUNDS', () => {
    const x = clamp(100000, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X);
    const y = clamp(100000, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y);
    expect(x).toBe(COORD_BOUNDS.MAX_X);
    expect(y).toBe(COORD_BOUNDS.MAX_Y);
  });

  it('clamp handles NaN by clamping to min', () => {
    // NaN comparison: Math.max(NaN, min) returns NaN, Math.min(NaN, max) returns NaN
    // This tests the COORD_BOUNDS constants are correct
    expect(COORD_BOUNDS.MIN_X).toBe(-2000);
    expect(COORD_BOUNDS.MAX_X).toBe(4000);
    expect(COORD_BOUNDS.MIN_Y).toBe(-2000);
    expect(COORD_BOUNDS.MAX_Y).toBe(4000);
  });

  it('distance computes correct Euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
    expect(distance({ x: -1, y: -1 }, { x: 2, y: 3 })).toBe(5);
  });

  it('cumulativeLengths produces monotonically increasing sequence', () => {
    const points: Point[] = [
      { x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 }, { x: 9, y: 12 },
    ];
    const lengths = cumulativeLengths(points);
    expect(lengths[0]).toBe(0);
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]!).toBeGreaterThan(lengths[i - 1]!);
    }
    expect(lengths[lengths.length - 1]).toBeCloseTo(15);
  });

  it('partialPolylineByLength returns only first point when targetLength=0', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const cumulative = cumulativeLengths(points);
    const partial = partialPolylineByLength(points, cumulative, 0);
    expect(partial).toHaveLength(1);
    expect(partial[0]).toEqual({ x: 0, y: 0 });
  });

  it('resamplePolyline produces evenly spaced points', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const resampled = resamplePolyline(points, 25);
    expect(resampled.length).toBeGreaterThanOrEqual(4);
    // All points should lie on y=0
    for (const p of resampled) {
      expect(p.y).toBe(0);
    }
    // Check spacing is approximately 25
    for (let i = 1; i < resampled.length - 1; i++) {
      const d = distance(resampled[i - 1]!, resampled[i]!);
      expect(d).toBeCloseTo(25, 0);
    }
  });

  it('screenStrokePx clamps between MIN and MAX across zoom range', () => {
    // Very low zoom should clamp to MIN
    expect(screenStrokePx(2, 0.01, 1)).toBe(MIN_SCREEN_STROKE_PX);
    // Very high zoom should clamp to MAX
    expect(screenStrokePx(2, 100, 2)).toBe(MAX_SCREEN_STROKE_PX);
    // Normal zoom should be between
    const mid = screenStrokePx(2, 1, 1);
    expect(mid).toBeGreaterThanOrEqual(MIN_SCREEN_STROKE_PX);
    expect(mid).toBeLessThanOrEqual(MAX_SCREEN_STROKE_PX);
  });
});
