import { describe, expect, it } from 'vitest';
import {
  cumulativeLengths,
  partialPolylineByLength,
  totalLength,
} from '@/lib/whiteboard/geometry';
import { easeOutCubic } from '@/lib/whiteboard/stroke-scheduler';
import type { Point } from '@/types/agent';

describe('cumulativeLengths invariants', () => {
  it('returns [0] for single-point input', () => {
    expect(cumulativeLengths([{ x: 5, y: 5 }])).toEqual([0]);
  });

  it('returns [] for empty input', () => {
    expect(cumulativeLengths([])).toEqual([]);
  });

  it('is monotonically non-decreasing for random points', () => {
    const rng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s / 0x7fffffff) * 500;
      };
    };
    const r = rng(42);
    const points: Point[] = Array.from({ length: 20 }, () => ({ x: r(), y: r() }));
    const cum = cumulativeLengths(points);
    for (let i = 1; i < cum.length; i++) {
      expect(cum[i]!).toBeGreaterThanOrEqual(cum[i - 1]!);
    }
  });

  it('has length equal to points length', () => {
    for (const n of [2, 5, 10]) {
      const points: Point[] = Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0 }));
      expect(cumulativeLengths(points)).toHaveLength(n);
    }
  });
});

describe('partialPolylineByLength edge cases', () => {
  const points: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  const cumulative = cumulativeLengths(points);

  it('returns first point only when targetLength is 0', () => {
    const result = partialPolylineByLength(points, cumulative, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(points[0]);
  });

  it('returns all points when targetLength >= total', () => {
    const result = partialPolylineByLength(points, cumulative, Infinity);
    expect(result).toEqual(points);
  });

  it('returns the single point for single-point input', () => {
    const single: Point[] = [{ x: 7, y: 3 }];
    const cum = cumulativeLengths(single);
    const result = partialPolylineByLength(single, cum, 50);
    expect(result).toEqual([{ x: 7, y: 3 }]);
  });
});

describe('totalLength edge cases', () => {
  it('returns 0 for coincident points', () => {
    expect(totalLength([{ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }])).toBe(0);
  });
});

describe('easeOutCubic invariants', () => {
  it('returns 0 for t=0 and 1 for t=1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('clamps out-of-range inputs', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it('is monotonically non-decreasing', () => {
    const samples = Array.from({ length: 101 }, (_, i) => easeOutCubic(i / 100));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
  });
});
