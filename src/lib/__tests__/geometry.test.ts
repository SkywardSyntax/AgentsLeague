import { describe, expect, it } from 'vitest';
import {
  clamp,
  cumulativeLengths,
  distance,
  partialPolylineByLength,
  resamplePolyline,
  screenStrokePx,
  totalLength,
} from '@/lib/whiteboard/geometry';
import { rectPoints, withJitter, resolveSourceElementId } from '@/lib/whiteboard/semantic-to-strokes';

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

describe('resamplePolyline edge cases', () => {
  it('returns points unchanged when spacing <= 0 (bug M1)', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(resamplePolyline(points, 0)).toBe(points);
    expect(resamplePolyline(points, -5)).toBe(points);
  });

  it('returns empty array for empty input', () => {
    expect(resamplePolyline([], 5)).toEqual([]);
  });

  it('returns single point unchanged', () => {
    const single = [{ x: 5, y: 5 }];
    expect(resamplePolyline(single, 3)).toBe(single);
  });

  it('handles coincident points gracefully', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const result = resamplePolyline(pts, 3);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[result.length - 1]).toEqual({ x: 10, y: 0 });
  });

  it('preserves first and last points', () => {
    const pts = [
      { x: 1, y: 2 },
      { x: 50, y: 60 },
      { x: 100, y: 3 },
    ];
    const result = resamplePolyline(pts, 5);
    expect(result[0]).toEqual({ x: 1, y: 2 });
    expect(result[result.length - 1]).toEqual({ x: 100, y: 3 });
  });
});

describe('distance', () => {
  it('computes distance between two points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('returns 0 for coincident points', () => {
    expect(distance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});

describe('cumulativeLengths', () => {
  it('returns empty for empty input', () => {
    expect(cumulativeLengths([])).toEqual([]);
  });

  it('returns [0] for single point', () => {
    expect(cumulativeLengths([{ x: 0, y: 0 }])).toEqual([0]);
  });

  it('computes cumulative lengths correctly', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 14 },
    ];
    const result = cumulativeLengths(pts);
    expect(result).toEqual([0, 5, 15]);
  });
});

describe('totalLength', () => {
  it('returns 0 for empty input', () => {
    expect(totalLength([])).toBe(0);
  });

  it('computes total polyline length', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(totalLength(pts)).toBe(20);
  });
});

describe('partialPolylineByLength edge cases', () => {
  it('returns single point for targetLength = 0', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const result = partialPolylineByLength(pts, [0, 10], 0);
    expect(result).toEqual([{ x: 0, y: 0 }]);
  });

  it('returns all points when targetLength >= total', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(partialPolylineByLength(pts, [0, 10], 100)).toBe(pts);
  });

  it('returns input for single point', () => {
    const pts = [{ x: 5, y: 5 }];
    expect(partialPolylineByLength(pts, [0], 5)).toBe(pts);
  });
});

describe('clamp', () => {
  it('clamps values within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('withJitter consolidated', () => {
  it('accepts numeric amount', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ];
    const result = withJitter(pts, 'seed', 0.5);
    // First and last preserved
    expect(result[0]).toEqual(pts[0]);
    expect(result[2]).toEqual(pts[2]);
    // Middle modified
    expect(result[1]).not.toEqual(pts[1]);
  });

  it('returns points unchanged for zero amount', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(withJitter(pts, 'seed', 0)).toBe(pts);
  });
});

describe('resolveSourceElementId', () => {
  it('resolves exact match', () => {
    expect(resolveSourceElementId('elem1', ['elem1', 'elem2'])).toBe('elem1');
  });

  it('resolves prefix match', () => {
    expect(resolveSourceElementId('elem1-seg-0', ['elem1', 'elem2'])).toBe('elem1');
  });

  it('returns null for no match', () => {
    expect(resolveSourceElementId('unknown', ['elem1', 'elem2'])).toBeNull();
  });
});
