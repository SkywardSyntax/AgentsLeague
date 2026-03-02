import { describe, expect, it } from 'vitest';
import {
  clamp,
  distance,
  partialPolylineByLength,
  resamplePolyline,
  screenStrokePx,
} from '@/lib/whiteboard/geometry';
import { rectPoints, withJitter } from '@/lib/whiteboard/semantic-to-strokes';

describe('geometry + sketch behavior', () => {
  it('follows rectangle corner order and closes path', () => {
    const pts = rectPoints({ type: 'rect', id: 'r1', x: 10, y: 20, w: 30, h: 40 });
    expect(pts[0]).toEqual({ x: 10, y: 20 });
    expect(pts[1]).toEqual({ x: 40, y: 20 });
    expect(pts[2]).toEqual({ x: 40, y: 60 });
    expect(pts[3]).toEqual({ x: 10, y: 60 });
    expect(pts[4]).toEqual({ x: 10, y: 20 });
  });

  it('reveals only partial path for progressive drawing', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const cumulative = [0, 100, 200];
    const partial = partialPolylineByLength(points, cumulative, 150);

    expect(partial.length).toBe(3);
    expect(partial[2]?.x).toBe(100);
    expect(partial[2]?.y).toBe(50);
  });

  it('keeps jitter deterministic for identical seed', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ];
    const a = withJitter(points, 'seed-1', 'clean_pen_sketch');
    const b = withJitter(points, 'seed-1', 'clean_pen_sketch');

    expect(a).toEqual(b);
  });

  it('clamps stroke width across zoom levels', () => {
    expect(screenStrokePx(0.8, 0.1, 1)).toBeGreaterThanOrEqual(1.25);
    expect(screenStrokePx(10, 2, 2)).toBeLessThanOrEqual(5.5);
  });

  it('clamp returns value when within range, min when below, max when above', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('clamp handles min === max boundary', () => {
    expect(clamp(5, 5, 5)).toBe(5);
  });

  it('distance returns correct value for 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('distance returns 0 for same point', () => {
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });

  it('resamplePolyline with single point returns that point', () => {
    const single = [{ x: 5, y: 5 }];
    expect(resamplePolyline(single, 1)).toEqual(single);
  });

  it('resamplePolyline with collinear points and spacing=1 produces evenly-spaced output', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
    ];
    const result = resamplePolyline(points, 1);
    // Should produce points at x=0,1,2,3,4 along y=0
    for (let i = 0; i < result.length - 1; i++) {
      const d = distance(result[i]!, result[i + 1]!);
      expect(d).toBeCloseTo(1, 5);
    }
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[result.length - 1]).toEqual({ x: 4, y: 0 });
  });
});
