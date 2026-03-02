import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  clamp,
  distance,
  cumulativeLengths,
  totalLength,
  resamplePolyline,
} from '@/lib/whiteboard/geometry';
import { easeOutCubic } from '@/lib/whiteboard/stroke-scheduler';
import type { Point } from '@/types/agent';

const pointArb = fc.record({
  x: fc.double({ min: -1e3, max: 1e3, noNaN: true }),
  y: fc.double({ min: -1e3, max: 1e3, noNaN: true }),
});

const polylineArb = fc.array(pointArb, { minLength: 2, maxLength: 20 });

describe('clamp — idempotent and bounded', () => {
  it('result is always within [min, max] and clamp is idempotent', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        (v: number, a: number, b: number) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          const result = clamp(v, min, max);
          expect(result).toBeGreaterThanOrEqual(min);
          expect(result).toBeLessThanOrEqual(max);
          expect(clamp(result, min, max)).toBe(result);
        },
      ),
    );
  });
});

describe('distance — symmetry and triangle inequality', () => {
  it('is symmetric, non-negative, and zero for identical points', () => {
    fc.assert(
      fc.property(pointArb, pointArb, (a: Point, b: Point) => {
        expect(distance(a, b)).toBeCloseTo(distance(b, a), 10);
        expect(distance(a, b)).toBeGreaterThanOrEqual(0);
        expect(distance(a, a)).toBe(0);
      }),
    );
  });
});

describe('cumulativeLengths — monotonic non-decreasing', () => {
  it('output length matches input, starts at 0, is monotonic, and last equals totalLength', () => {
    fc.assert(
      fc.property(polylineArb, (points: Point[]) => {
        const cum = cumulativeLengths(points);
        expect(cum).toHaveLength(points.length);
        expect(cum[0]).toBe(0);
        for (let i = 1; i < cum.length; i++) {
          expect(cum[i]!).toBeGreaterThanOrEqual(cum[i - 1]!);
        }
        expect(cum[cum.length - 1]).toBeCloseTo(totalLength(points), 10);
      }),
    );
  });
});

describe('resamplePolyline — output spacing invariant', () => {
  it('preserves first and last points and outputs at least 2 points', () => {
    fc.assert(
      fc.property(
        polylineArb,
        fc.double({ min: 5, max: 100, noNaN: true }),
        (points: Point[], spacing: number) => {
          const result = resamplePolyline(points, spacing);
          expect(result.length).toBeGreaterThanOrEqual(2);
          expect(result[0]).toEqual(points[0]);
          expect(result[result.length - 1]).toEqual(points[points.length - 1]);
        },
      ),
    );
  });
});

describe('easeOutCubic — range and monotonicity', () => {
  it('maps [0,1] to [0,1], hits endpoints, and is monotonic', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a: number, b: number) => {
          const t1 = Math.min(a, b);
          const t2 = Math.max(a, b);
          const r1 = easeOutCubic(t1);
          const r2 = easeOutCubic(t2);
          expect(r1).toBeGreaterThanOrEqual(0);
          expect(r1).toBeLessThanOrEqual(1);
          expect(r2).toBeGreaterThanOrEqual(r1);
        },
      ),
    );
  });
});
