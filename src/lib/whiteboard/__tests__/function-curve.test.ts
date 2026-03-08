import { describe, it, expect } from 'vitest';
import { lowerMathPrimitive } from '../planner/lowerer';
import { parseMathExpression } from '../graph-script';
import { sampleFunction } from '../math-sampling';
import type { FunctionCurveElement } from '@/types/agent';

/** Helper to build a FunctionCurveElement with sensible defaults. */
function makeCurve(
  overrides: Partial<FunctionCurveElement> & { expression?: string; points?: Array<{ x: number; y: number }> },
): FunctionCurveElement {
  return {
    id: 'test-curve',
    type: 'function_curve',
    x: 0,
    y: 0,
    width: 500,
    height: 300,
    xRange: [-Math.PI, Math.PI],
    yRange: [-1.5, 1.5],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseMathExpression — expression parsing
// ---------------------------------------------------------------------------
describe('parseMathExpression', () => {
  it('parses sin(x)', () => {
    const fn = parseMathExpression('sin(x)');
    expect(fn).not.toBeNull();
    expect(fn!(0)).toBeCloseTo(0);
    expect(fn!(Math.PI / 2)).toBeCloseTo(1);
  });

  it('parses cos(x)', () => {
    const fn = parseMathExpression('cos(x)');
    expect(fn).not.toBeNull();
    expect(fn!(0)).toBeCloseTo(1);
    expect(fn!(Math.PI)).toBeCloseTo(-1);
  });

  it('parses tan(x)', () => {
    const fn = parseMathExpression('tan(x)');
    expect(fn).not.toBeNull();
    expect(fn!(0)).toBeCloseTo(0);
    expect(fn!(Math.PI / 4)).toBeCloseTo(1);
  });

  it('parses x^2', () => {
    const fn = parseMathExpression('x^2');
    expect(fn).not.toBeNull();
    expect(fn!(3)).toBeCloseTo(9);
    expect(fn!(-2)).toBeCloseTo(4);
  });

  it('parses x^3', () => {
    const fn = parseMathExpression('x^3');
    expect(fn).not.toBeNull();
    expect(fn!(2)).toBeCloseTo(8);
    expect(fn!(-3)).toBeCloseTo(-27);
  });

  it('parses sqrt(x)', () => {
    const fn = parseMathExpression('sqrt(x)');
    expect(fn).not.toBeNull();
    expect(fn!(4)).toBeCloseTo(2);
    expect(fn!(9)).toBeCloseTo(3);
  });

  it('parses 1/x', () => {
    const fn = parseMathExpression('1/x');
    expect(fn).not.toBeNull();
    expect(fn!(2)).toBeCloseTo(0.5);
    expect(fn!(-4)).toBeCloseTo(-0.25);
  });

  it('parses exp(x)', () => {
    const fn = parseMathExpression('exp(x)');
    expect(fn).not.toBeNull();
    expect(fn!(0)).toBeCloseTo(1);
    expect(fn!(1)).toBeCloseTo(Math.E);
  });

  it('parses ln(x) and log(x) as natural log', () => {
    const fnLn = parseMathExpression('ln(x)');
    const fnLog = parseMathExpression('log(x)');
    expect(fnLn).not.toBeNull();
    expect(fnLog).not.toBeNull();
    expect(fnLn!(Math.E)).toBeCloseTo(1);
    expect(fnLog!(Math.E)).toBeCloseTo(1);
  });

  it('parses abs(x)', () => {
    const fn = parseMathExpression('abs(x)');
    expect(fn).not.toBeNull();
    expect(fn!(-5)).toBeCloseTo(5);
    expect(fn!(3)).toBeCloseTo(3);
  });

  it('parses exp(-x^2/2) (Gaussian)', () => {
    const fn = parseMathExpression('exp(-x^2/2)');
    expect(fn).not.toBeNull();
    expect(fn!(0)).toBeCloseTo(1);
    // At x=1, exp(-0.5) ≈ 0.6065
    expect(fn!(1)).toBeCloseTo(Math.exp(-0.5));
    // Symmetric
    expect(fn!(2)).toBeCloseTo(fn!(-2));
  });

  it('parses x^2 + 1', () => {
    const fn = parseMathExpression('x^2 + 1');
    expect(fn).not.toBeNull();
    expect(fn!(0)).toBeCloseTo(1);
    expect(fn!(3)).toBeCloseTo(10);
  });

  it('returns null for invalid expressions', () => {
    expect(parseMathExpression('garbage')).toBeNull();
    expect(parseMathExpression('')).toBeNull();
    expect(parseMathExpression('***')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sampleFunction — discontinuity-aware sampling of parsed expressions
// ---------------------------------------------------------------------------
describe('sampleFunction with parsed expressions', () => {
  it('sin(x) over [-π, π] produces a single continuous segment', () => {
    const fn = parseMathExpression('sin(x)')!;
    const segments = sampleFunction(fn, -Math.PI, Math.PI, 200);
    expect(segments.length).toBe(1);
    expect(segments[0]!.length).toBe(200);
  });

  it('1/x over [-5, 5] splits at x≈0 into two segments', () => {
    const fn = parseMathExpression('1/x')!;
    // Use a yRange-aware maxSlope: threshold ≈ ySpan (20 for yRange [-10,10])
    const ySpan = 20;
    const xSpan = 10;
    const steps = 200;
    const maxSlope = (ySpan * steps) / xSpan;
    const segments = sampleFunction(fn, -5, 5, steps, maxSlope);
    // Should have at least 2 segments split around x=0
    expect(segments.length).toBeGreaterThanOrEqual(2);
    // The two main segments (negative and positive x) should have many points
    const mainSegments = segments.filter((s) => s.length >= 10);
    expect(mainSegments.length).toBeGreaterThanOrEqual(2);
  });

  it('tan(x) over [-π, π] splits at ±π/2', () => {
    const fn = parseMathExpression('tan(x)')!;
    const ySpan = 20;
    const xSpan = 2 * Math.PI;
    const steps = 300;
    const maxSlope = (ySpan * steps) / xSpan;
    const segments = sampleFunction(fn, -Math.PI, Math.PI, steps, maxSlope);
    // Should have at least 3 segments: (-π, -π/2), (-π/2, π/2), (π/2, π)
    expect(segments.length).toBeGreaterThanOrEqual(3);
  });

  it('exp(-x^2/2) over [-4, 4] produces a single smooth segment', () => {
    const fn = parseMathExpression('exp(-x^2/2)')!;
    const segments = sampleFunction(fn, -4, 4, 200);
    expect(segments.length).toBe(1);
    const pts = segments[0]!;
    expect(pts.length).toBe(200);
    // Bell curve: peak at x=0
    const midIdx = Math.floor(pts.length / 2);
    const midY = pts[midIdx]!.y;
    expect(midY).toBeCloseTo(1, 1);
    // Tails should be near zero
    expect(pts[0]!.y).toBeLessThan(0.01);
    expect(pts[pts.length - 1]!.y).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// expandFunctionCurve via lowerMathPrimitive — end-to-end lowering
// ---------------------------------------------------------------------------
describe('expandFunctionCurve (via lowerMathPrimitive)', () => {
  it('sin(x) over [-π, π] produces 50+ line segments', () => {
    const el = makeCurve({ expression: 'sin(x)' });
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(50);
  });

  it('1/x over [-5, 5] splits at x≈0 into two groups of lines', () => {
    const el = makeCurve({
      expression: '1/x',
      xRange: [-5, 5],
      yRange: [-10, 10],
    });
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(50);

    // Check segment IDs — should have at least seg0 and seg1
    const segIds = new Set(
      lines.map((l) => l.id.match(/seg(\d+)/)?.[1]).filter(Boolean),
    );
    expect(segIds.size).toBeGreaterThanOrEqual(2);
  });

  it('tan(x) over [-π, π] splits at ±π/2 into 3+ segment groups', () => {
    const el = makeCurve({
      expression: 'tan(x)',
      yRange: [-10, 10],
    });
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(50);

    const segIds = new Set(
      lines.map((l) => l.id.match(/seg(\d+)/)?.[1]).filter(Boolean),
    );
    expect(segIds.size).toBeGreaterThanOrEqual(3);
  });

  it('exp(-x^2/2) (Gaussian) over [-4, 4] produces a smooth bell curve', () => {
    const el = makeCurve({
      expression: 'exp(-x^2/2)',
      xRange: [-4, 4],
      yRange: [-0.5, 1.5],
    });
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    // Should be a single continuous set of line segments
    expect(lines.length).toBeGreaterThanOrEqual(50);

    // All lines should be in segment 0 (continuous)
    const segIds = new Set(
      lines.map((l) => l.id.match(/seg(\d+)/)?.[1]).filter(Boolean),
    );
    expect(segIds.size).toBe(1);
  });

  it('invalid expression gracefully returns empty', () => {
    const el = makeCurve({ expression: 'garbage' });
    const result = lowerMathPrimitive(el);
    expect(result).toHaveLength(0);
  });

  it('empty expression returns empty', () => {
    const el = makeCurve({ expression: '' });
    const result = lowerMathPrimitive(el);
    expect(result).toHaveLength(0);
  });

  it('pre-sampled points still work as fallback', () => {
    const points = Array.from({ length: 50 }, (_, i) => {
      const x = -Math.PI + (i / 49) * 2 * Math.PI;
      return { x, y: Math.sin(x) };
    });
    const el = makeCurve({ points });
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(20);
  });

  it('adds label element when label is provided', () => {
    const el = makeCurve({ expression: 'sin(x)', label: 'f(x) = sin(x)' });
    const result = lowerMathPrimitive(el);
    const labels = result.filter((e) => e.type === 'text');
    expect(labels.length).toBe(1);
  });
});
