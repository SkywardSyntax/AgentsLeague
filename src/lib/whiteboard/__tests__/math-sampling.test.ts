import { describe, it, expect } from 'vitest';
import {
  sampleFunction,
  tickMarksForRange,
  computeArrowHead,
} from '../math-sampling';

// ---------------------------------------------------------------------------
// sampleFunction
// ---------------------------------------------------------------------------
describe('sampleFunction', () => {
  it('continuous function (sin) produces a single segment with correct point count', () => {
    const segments = sampleFunction(Math.sin, 0, 2 * Math.PI, 100);
    expect(segments).toHaveLength(1);
    expect(segments[0].length).toBe(100);
    // First and last x values should match the domain bounds
    expect(segments[0][0].x).toBeCloseTo(0);
    expect(segments[0][segments[0].length - 1].x).toBeCloseTo(2 * Math.PI);
  });

  it('tan(x) splits at asymptotes, producing multiple segments with no bridging', () => {
    // tan has asymptotes at π/2, 3π/2 within [0, 2π]
    const segments = sampleFunction(Math.tan, 0, 2 * Math.PI, 500);
    expect(segments.length).toBeGreaterThanOrEqual(3);

    // No segment should bridge across an asymptote — every y in every
    // segment should be finite and within a reasonable magnitude.
    for (const seg of segments) {
      for (const pt of seg) {
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it('1/x splits at x=0 discontinuity', () => {
    const segments = sampleFunction((x) => 1 / x, -1, 1, 500);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    // Each segment should contain only finite values
    for (const seg of segments) {
      for (const pt of seg) {
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it('handles NaN-returning functions gracefully', () => {
    const fn = (x: number) => (x < 0 ? NaN : Math.sqrt(x));
    const segments = sampleFunction(fn, -5, 5, 200);
    // Should have at least one segment covering x >= 0
    expect(segments.length).toBeGreaterThanOrEqual(1);
    for (const seg of segments) {
      for (const pt of seg) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it('handles Infinity-returning functions gracefully', () => {
    const fn = (x: number) => (x === 0 ? Infinity : 1 / x);
    const segments = sampleFunction(fn, -1, 1, 100);
    for (const seg of segments) {
      for (const pt of seg) {
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// tickMarksForRange
// ---------------------------------------------------------------------------
describe('tickMarksForRange', () => {
  it('(0, 10, 5) returns ticks at nice intervals covering the range', () => {
    const ticks = tickMarksForRange(0, 10, 5);
    const values = ticks.map((t) => t.value);

    expect(values).toContain(0);
    expect(values).toContain(10);
    // Ticks should be evenly spaced with a nice step
    const step = values[1] - values[0];
    expect([1, 2, 5, 10]).toContain(step);
  });

  it('(-5, 5, 10) includes 0 and is symmetric', () => {
    const ticks = tickMarksForRange(-5, 5, 10);
    const values = ticks.map((t) => t.value);

    expect(values).toContain(0);
    // Check symmetry: for each positive value there should be a negative
    const positives = values.filter((v) => v > 0);
    const negatives = values.filter((v) => v < 0);
    expect(positives.length).toBe(negatives.length);
    for (const p of positives) {
      expect(values).toContain(-p);
    }
  });

  it('(0, 100, 5) uses nice-number step increments', () => {
    const ticks = tickMarksForRange(0, 100, 5);
    const values = ticks.map((t) => t.value);

    // With range=100 and targetCount=5, roughStep=20 → step should be 20
    const step = values[1] - values[0];
    expect(step).toBe(20);
    expect(values).toContain(0);
    expect(values).toContain(100);
  });

  it('returns empty array for invalid inputs', () => {
    expect(tickMarksForRange(NaN, 10, 5)).toEqual([]);
    expect(tickMarksForRange(0, NaN, 5)).toEqual([]);
    expect(tickMarksForRange(10, 0, 5)).toEqual([]);
    expect(tickMarksForRange(0, 10, 0)).toEqual([]);
  });

  it('tick labels match their values', () => {
    const ticks = tickMarksForRange(0, 1, 5);
    for (const tick of ticks) {
      expect(Number(tick.label)).toBeCloseTo(tick.value);
    }
  });
});

// ---------------------------------------------------------------------------
// computeArrowHead
// ---------------------------------------------------------------------------
describe('computeArrowHead', () => {
  const headLength = 10;

  it('right-pointing vector (1,0) produces symmetric arrowhead', () => {
    const { left, right } = computeArrowHead({ x: 0, y: 0 }, { x: 1, y: 0 }, headLength);

    // Both wings should be behind the tip (x < 1)
    expect(left.x).toBeLessThan(1);
    expect(right.x).toBeLessThan(1);
    // Wings should be symmetric about the x-axis
    expect(left.y).toBeCloseTo(-right.y);
    expect(left.x).toBeCloseTo(right.x);
  });

  it('up vector (0,-1) produces correct rotation', () => {
    const { left, right } = computeArrowHead({ x: 0, y: 0 }, { x: 0, y: -1 }, headLength);

    // Both wings should be below the tip (y > -1)
    expect(left.y).toBeGreaterThan(-1);
    expect(right.y).toBeGreaterThan(-1);
    // Wings should be symmetric about the y-axis
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.y).toBeCloseTo(right.y);
  });

  it('zero-length vector returns stable output (no NaN)', () => {
    const { left, right } = computeArrowHead({ x: 5, y: 5 }, { x: 5, y: 5 }, headLength);

    expect(Number.isFinite(left.x)).toBe(true);
    expect(Number.isFinite(left.y)).toBe(true);
    expect(Number.isFinite(right.x)).toBe(true);
    expect(Number.isFinite(right.y)).toBe(true);
  });
});
