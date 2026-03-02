import { describe, expect, it } from 'vitest';
import {
  clamp,
  cumulativeLengths,
  distance,
  partialPolylineByLength,
  resamplePolyline,
  screenStrokePx,
  totalLength,
  strokesBoundingBox,
  bezierPointAt,
  bezierLength,
  bezierChainLength,
  bezierPointAtArcLength,
  catmullRomToBezier,
} from '@/lib/whiteboard/geometry';
import type { BezierSegment } from '@/lib/whiteboard/geometry';
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

describe('strokesBoundingBox', () => {
  it('computes bounds for strokes with points', () => {
    const strokes = [
      { points: [{ x: 10, y: 20 }, { x: 50, y: 60 }] },
      { points: [{ x: 5, y: 30 }, { x: 40, y: 70 }] },
    ];
    const bounds = strokesBoundingBox(strokes);
    expect(bounds).toEqual({ minX: 5, maxX: 50, minY: 20, maxY: 70, width: 45, height: 50 });
  });

  it('returns null for empty strokes', () => {
    expect(strokesBoundingBox([])).toBeNull();
  });

  it('returns null for strokes with no points', () => {
    expect(strokesBoundingBox([{ points: [] }])).toBeNull();
  });

  it('returns zero width/height for a single point', () => {
    const bounds = strokesBoundingBox([{ points: [{ x: 5, y: 5 }] }]);
    expect(bounds).toEqual({ minX: 5, maxX: 5, minY: 5, maxY: 5, width: 0, height: 0 });
  });
});

describe('bezierPointAt', () => {
  const straight: BezierSegment = {
    p0: { x: 0, y: 0 },
    cp1: { x: 10, y: 0 },
    cp2: { x: 20, y: 0 },
    p3: { x: 30, y: 0 },
  };

  it('returns p0 at t=0', () => {
    const p = bezierPointAt(straight, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('returns p3 at t=1', () => {
    const p = bezierPointAt(straight, 1);
    expect(p.x).toBeCloseTo(30);
    expect(p.y).toBeCloseTo(0);
  });

  it('returns midpoint at t=0.5 for a straight segment', () => {
    const p = bezierPointAt(straight, 0.5);
    expect(p.x).toBeCloseTo(15);
    expect(p.y).toBeCloseTo(0);
  });
});

describe('bezierLength', () => {
  it('matches distance for a straight-line Bézier', () => {
    const seg: BezierSegment = {
      p0: { x: 0, y: 0 },
      cp1: { x: 33.33, y: 0 },
      cp2: { x: 66.67, y: 0 },
      p3: { x: 100, y: 0 },
    };
    expect(bezierLength(seg)).toBeCloseTo(100, 0);
  });

  it('approximates quarter-circle arc length', () => {
    const r = 100;
    const k = 0.5522847498;
    const seg: BezierSegment = {
      p0: { x: r, y: 0 },
      cp1: { x: r, y: r * k },
      cp2: { x: r * k, y: r },
      p3: { x: 0, y: r },
    };
    const expected = (Math.PI * r) / 2;
    expect(bezierLength(seg, 64)).toBeCloseTo(expected, 0);
  });
});

describe('bezierChainLength', () => {
  it('sums lengths of multiple segments', () => {
    const seg: BezierSegment = {
      p0: { x: 0, y: 0 },
      cp1: { x: 33, y: 0 },
      cp2: { x: 67, y: 0 },
      p3: { x: 100, y: 0 },
    };
    expect(bezierChainLength([seg, seg])).toBeCloseTo(200, 0);
  });

  it('returns 0 for empty array', () => {
    expect(bezierChainLength([])).toBe(0);
  });
});

describe('partialPolylineByLength — negative and boundary values', () => {
  it('treats negative targetLength same as 0', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const result = partialPolylineByLength(pts, [0, 10], -5);
    expect(result).toEqual([{ x: 0, y: 0 }]);
  });

  it('handles two coincident points', () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    const result = partialPolylineByLength(pts, [0, 0], 0);
    expect(result).toEqual([{ x: 5, y: 5 }]);
  });

  it('includes segment endpoint when targetLength lands exactly on it', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    // targetLength exactly at first segment end — includes that point plus interpolated duplicate
    const result = partialPolylineByLength(pts, [0, 10, 20], 10);
    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 10, y: 0 });
    expect(result[2]).toEqual({ x: 10, y: 0 });
  });
});

describe('resamplePolyline — large spacing and edge cases', () => {
  it('returns start and end when spacing exceeds total length', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 3, y: 4 }, // total length = 5
    ];
    const result = resamplePolyline(pts, 100);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[result.length - 1]).toEqual({ x: 3, y: 4 });
  });

  it('spacing equal to total length gives 2 points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const result = resamplePolyline(pts, 10);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 10, y: 0 });
  });
});

describe('catmullRomToBezier', () => {
  it('returns empty for fewer than 2 points', () => {
    expect(catmullRomToBezier([])).toEqual([]);
    expect(catmullRomToBezier([{ x: 0, y: 0 }])).toEqual([]);
  });

  it('2 points → 1 segment', () => {
    const segs = catmullRomToBezier([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.p0).toEqual({ x: 0, y: 0 });
    expect(segs[0]!.p3).toEqual({ x: 10, y: 0 });
  });

  it('3 points → 2 segments', () => {
    const segs = catmullRomToBezier([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]);
    expect(segs).toHaveLength(2);
  });

  it('collinear points evaluate to the original line', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }];
    const segs = catmullRomToBezier(pts);
    expect(segs).toHaveLength(3);
    for (const seg of segs) {
      const mid = bezierPointAt(seg, 0.5);
      expect(mid.y).toBeCloseTo(0, 5);
    }
  });

  it('handles coincident consecutive points without error', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const segs = catmullRomToBezier(pts);
    expect(segs).toHaveLength(3);
    // Endpoints should match original points
    expect(segs[0]!.p0).toEqual({ x: 0, y: 0 });
    expect(segs[segs.length - 1]!.p3).toEqual({ x: 20, y: 0 });
  });

  it('all-coincident points produce degenerate but valid segments', () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    const segs = catmullRomToBezier(pts);
    expect(segs).toHaveLength(2);
    for (const seg of segs) {
      const mid = bezierPointAt(seg, 0.5);
      expect(mid.x).toBeCloseTo(5);
      expect(mid.y).toBeCloseTo(5);
    }
  });

  it('clamps negative tension to 0.01', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const segs = catmullRomToBezier(pts, -5);
    expect(segs).toHaveLength(2);
    // Should not throw or produce NaN/Infinity
    for (const seg of segs) {
      const mid = bezierPointAt(seg, 0.5);
      expect(Number.isFinite(mid.x)).toBe(true);
      expect(Number.isFinite(mid.y)).toBe(true);
    }
  });

  it('clamps tension > 1 to 1', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const segsHigh = catmullRomToBezier(pts, 100);
    const segsClamped = catmullRomToBezier(pts, 1);
    expect(segsHigh).toEqual(segsClamped);
  });

  it('tension=0.01 produces nearly straight segments for collinear points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const segs = catmullRomToBezier(pts, 0);
    for (const seg of segs) {
      const mid = bezierPointAt(seg, 0.5);
      expect(mid.y).toBeCloseTo(0, 1);
    }
  });
});

describe('bezierPointAtArcLength', () => {
  const straight: BezierSegment = {
    p0: { x: 0, y: 0 },
    cp1: { x: 33.33, y: 0 },
    cp2: { x: 66.67, y: 0 },
    p3: { x: 100, y: 0 },
  };
  const straightLen = bezierLength(straight, 64);

  it('at 0 returns p0', () => {
    const p = bezierPointAtArcLength(straight, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('at totalLen returns p3', () => {
    const p = bezierPointAtArcLength(straight, straightLen, straightLen);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
  });

  it('at half-length of straight segment returns midpoint', () => {
    const p = bezierPointAtArcLength(straight, straightLen / 2, straightLen);
    expect(p.x).toBeCloseTo(50, 0);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('on quarter-circle returns point near 45 degrees', () => {
    const r = 100;
    const k = 0.5522847498;
    const arc: BezierSegment = {
      p0: { x: r, y: 0 },
      cp1: { x: r, y: r * k },
      cp2: { x: r * k, y: r },
      p3: { x: 0, y: r },
    };
    const arcLen = bezierLength(arc, 64);
    const p = bezierPointAtArcLength(arc, arcLen / 2, arcLen, 64);
    // At half the arc, expect roughly 45 degrees: (r*cos45, r*sin45)
    const expected = r * Math.SQRT1_2;
    expect(p.x).toBeCloseTo(expected, -1);
    expect(p.y).toBeCloseTo(expected, -1);
  });

  it('negative targetLen returns p0', () => {
    const p = bezierPointAtArcLength(straight, -10);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('targetLen exceeding total returns p3', () => {
    const p = bezierPointAtArcLength(straight, 9999);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
  });

  it('zero-length segment returns p0/p3', () => {
    const degenerate: BezierSegment = {
      p0: { x: 5, y: 5 },
      cp1: { x: 5, y: 5 },
      cp2: { x: 5, y: 5 },
      p3: { x: 5, y: 5 },
    };
    const p = bezierPointAtArcLength(degenerate, 1);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(5);
  });
});

describe('strokesBoundingBox with padding', () => {
  it('with padding expands bounds', () => {
    const strokes = [{ points: [{ x: 10, y: 20 }, { x: 50, y: 60 }] }];
    const bounds = strokesBoundingBox(strokes, 5);
    expect(bounds).toEqual({ minX: 5, maxX: 55, minY: 15, maxY: 65, width: 50, height: 50 });
  });

  it('with padding=0 is unchanged', () => {
    const strokes = [{ points: [{ x: 10, y: 20 }, { x: 50, y: 60 }] }];
    const bounds = strokesBoundingBox(strokes, 0);
    expect(bounds).toEqual({ minX: 10, maxX: 50, minY: 20, maxY: 60, width: 40, height: 40 });
  });

  it('with padding on single point gives non-zero width/height', () => {
    const bounds = strokesBoundingBox([{ points: [{ x: 5, y: 5 }] }], 10);
    expect(bounds).toEqual({ minX: -5, maxX: 15, minY: -5, maxY: 15, width: 20, height: 20 });
  });

  it('negative padding is clamped to 0', () => {
    const strokes = [{ points: [{ x: 10, y: 20 }, { x: 50, y: 60 }] }];
    const bounds = strokesBoundingBox(strokes, -5);
    expect(bounds).toEqual({ minX: 10, maxX: 50, minY: 20, maxY: 60, width: 40, height: 40 });
  });

  it('empty strokes still return null regardless of padding', () => {
    expect(strokesBoundingBox([], 10)).toBeNull();
  });
});
