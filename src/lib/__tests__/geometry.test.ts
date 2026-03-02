import { describe, expect, it } from 'vitest';
import {
  partialPolylineByLength,
  screenStrokePx,
  computeFitCamera,
  resamplePolyline,
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
});

describe('computeFitCamera', () => {
  it('centers bbox and applies 0.9 margin zoom', () => {
    const result = computeFitCamera(
      { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      1000, 800, 0.25, 4,
    );
    expect(result).not.toBeNull();
    // zoom = min(1000/100, 800/100) * 0.9 = 8 * 0.9 = 7.2 → clamped to 4
    expect(result!.zoom).toBe(4);
    // center of bbox = (50, 50), camera: x = 500 - 50*4 = 300, y = 400 - 50*4 = 200
    expect(result!.x).toBe(300);
    expect(result!.y).toBe(200);
  });

  it('fits wide content horizontally', () => {
    const result = computeFitCamera(
      { minX: 0, minY: 0, maxX: 2000, maxY: 200 },
      1000, 800, 0.25, 4,
    );
    expect(result).not.toBeNull();
    // zoom = min(1000/2000, 800/200) * 0.9 = min(0.5, 4) * 0.9 = 0.45
    expect(result!.zoom).toBeCloseTo(0.45);
  });

  it('returns null for zero-area bbox', () => {
    expect(computeFitCamera({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 1000, 800, 0.25, 4)).toBeNull();
  });

  it('clamps zoom to minZoom for very large content', () => {
    const result = computeFitCamera(
      { minX: 0, minY: 0, maxX: 100000, maxY: 100000 },
      1000, 800, 0.25, 4,
    );
    expect(result).not.toBeNull();
    expect(result!.zoom).toBe(0.25);
  });

  it('applies explicit padding parameter', () => {
    const half = computeFitCamera(
      { minX: 0, minY: 0, maxX: 200, maxY: 200 },
      1000, 800, 0.1, 100,
      0.5,
    );
    const full = computeFitCamera(
      { minX: 0, minY: 0, maxX: 200, maxY: 200 },
      1000, 800, 0.1, 100,
      1.0,
    );
    expect(half).not.toBeNull();
    expect(full).not.toBeNull();
    // zoom scales proportionally with padding
    expect(half!.zoom / full!.zoom).toBeCloseTo(0.5);
  });

  it('clamps padding below 0.1', () => {
    const result = computeFitCamera(
      { minX: 0, minY: 0, maxX: 200, maxY: 200 },
      1000, 800, 0.1, 100,
      0,
    );
    const baseline = computeFitCamera(
      { minX: 0, minY: 0, maxX: 200, maxY: 200 },
      1000, 800, 0.1, 100,
      0.1,
    );
    expect(result).not.toBeNull();
    expect(result!.zoom).toBe(baseline!.zoom);
  });

  it('uses default 0.9 padding when not specified', () => {
    const withDefault = computeFitCamera(
      { minX: 0, minY: 0, maxX: 2000, maxY: 200 },
      1000, 800, 0.25, 4,
    );
    const explicit = computeFitCamera(
      { minX: 0, minY: 0, maxX: 2000, maxY: 200 },
      1000, 800, 0.25, 4,
      0.9,
    );
    expect(withDefault).toEqual(explicit);
  });
});

describe('resamplePolyline robustness', () => {
  it('returns copy for spacing = 0', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const result = resamplePolyline(pts, 0);
    expect(result).toEqual(pts);
    expect(result).not.toBe(pts);
  });

  it('returns copy for spacing = -1', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const result = resamplePolyline(pts, -1);
    expect(result).toEqual(pts);
    expect(result).not.toBe(pts);
  });

  it('returns copy for spacing = NaN', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const result = resamplePolyline(pts, NaN);
    expect(result).toEqual(pts);
    expect(result).not.toBe(pts);
  });

  it('returns single point for all-coincident input', () => {
    const pts = [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }];
    const result = resamplePolyline(pts, 2);
    expect(result).toEqual([{ x: 5, y: 5 }]);
  });
});
