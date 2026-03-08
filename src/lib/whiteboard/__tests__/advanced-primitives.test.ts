import { describe, it, expect } from 'vitest';
import { lowerMathPrimitive } from '../planner/lowerer';
import { normalizeDrawBatchPayload } from '@/lib/schema';
import type { ParametricCurveElement, PolarPlotElement } from '@/types/agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParametricCurve(
  overrides: Partial<ParametricCurveElement> = {},
): ParametricCurveElement {
  return {
    id: 'test-param',
    type: 'parametric_curve',
    x: 100,
    y: 100,
    width: 500,
    height: 500,
    xRange: [-2, 2],
    yRange: [-2, 2],
    tMin: 0,
    tMax: 2 * Math.PI,
    xExpression: 'cos(t)',
    yExpression: 'sin(t)',
    ...overrides,
  };
}

function makePolarPlot(
  overrides: Partial<PolarPlotElement> = {},
): PolarPlotElement {
  return {
    id: 'test-polar',
    type: 'polar_plot',
    cx: 400,
    cy: 400,
    radius: 200,
    expression: '1 + cos(theta)',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parametric_curve tests
// ---------------------------------------------------------------------------
describe('expandParametricCurve (via lowerMathPrimitive)', () => {
  it('unit circle (cos/sin) produces ~200 line segments forming a closed loop', () => {
    const el = makeParametricCurve();
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    // Default 200 steps → 199 line segments (single segment, no discontinuities)
    expect(lines.length).toBeGreaterThanOrEqual(190);
    expect(lines.length).toBeLessThanOrEqual(200);
  });

  it('all line coordinates are finite (no NaN)', () => {
    const el = makeParametricCurve();
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    for (const line of lines) {
      if (line.type !== 'line') continue;
      expect(Number.isFinite(line.from.x)).toBe(true);
      expect(Number.isFinite(line.from.y)).toBe(true);
      expect(Number.isFinite(line.to.x)).toBe(true);
      expect(Number.isFinite(line.to.y)).toBe(true);
    }
  });

  it('Lissajous curve produces smooth output', () => {
    const el = makeParametricCurve({
      xExpression: 'sin(3*t)',
      yExpression: 'sin(2*t)',
    });
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(150);
  });

  it('spiral produces output with custom steps', () => {
    const el = makeParametricCurve({
      xExpression: 't*cos(t)',
      yExpression: 't*sin(t)',
      tMin: 0,
      tMax: 4 * Math.PI,
      xRange: [-15, 15],
      yRange: [-15, 15],
      steps: 300,
    });
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(290);
  });

  it('adds label when provided', () => {
    const el = makeParametricCurve({ label: 'Unit Circle' });
    const result = lowerMathPrimitive(el);
    const labels = result.filter((e) => e.type === 'text');
    expect(labels.length).toBe(1);
  });

  it('invalid expression returns empty', () => {
    const el = makeParametricCurve({ xExpression: 'garbage!!!' });
    const result = lowerMathPrimitive(el);
    expect(result).toHaveLength(0);
  });

  it('validates via DrawBatchSchema.safeParse (normalizeDrawBatch)', () => {
    const el = makeParametricCurve();
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test',
      elements: [el],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.elements.length).toBe(1);
    expect(normalized!.elements[0]!.type).toBe('parametric_curve');
    const typeWarnings = warnings.filter((w: string) => w.includes('ParametricCurve'));
    expect(typeWarnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// polar_plot tests
// ---------------------------------------------------------------------------
describe('expandPolarPlot (via lowerMathPrimitive)', () => {
  it('cardioid produces smooth curve', () => {
    const el = makePolarPlot();
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    // Has both grid lines and curve segments
    expect(lines.length).toBeGreaterThanOrEqual(100);
  });

  it('all curve segment coordinates are finite (no NaN)', () => {
    const el = makePolarPlot();
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    for (const line of lines) {
      if (line.type !== 'line') continue;
      expect(Number.isFinite(line.from.x)).toBe(true);
      expect(Number.isFinite(line.from.y)).toBe(true);
      expect(Number.isFinite(line.to.x)).toBe(true);
      expect(Number.isFinite(line.to.y)).toBe(true);
    }
  });

  it('rose curve cos(2*theta) produces output', () => {
    const el = makePolarPlot({ expression: 'cos(2*theta)' });
    const result = lowerMathPrimitive(el);
    const lines = result.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(100);
  });

  it('polar grid is generated when showPolarGrid=true (default)', () => {
    const el = makePolarPlot();
    const result = lowerMathPrimitive(el);
    const gridLines = result.filter(
      (e) => e.type === 'line' && e.id.includes('-grid-'),
    );
    // Should have r-circle segments + angle lines
    expect(gridLines.length).toBeGreaterThan(0);
  });

  it('polar grid is omitted when showPolarGrid=false', () => {
    const el = makePolarPlot({ showPolarGrid: false });
    const result = lowerMathPrimitive(el);
    const gridLines = result.filter(
      (e) => e.type === 'line' && e.id.includes('-grid-'),
    );
    expect(gridLines.length).toBe(0);
  });

  it('adds label when provided', () => {
    const el = makePolarPlot({ label: 'Cardioid' });
    const result = lowerMathPrimitive(el);
    const labels = result.filter((e) => e.type === 'text');
    expect(labels.length).toBe(1);
  });

  it('invalid expression returns empty', () => {
    const el = makePolarPlot({ expression: 'invalid!!!' });
    const result = lowerMathPrimitive(el);
    // Only grid lines if showPolarGrid, but rFn is null so should be empty
    expect(result).toHaveLength(0);
  });

  it('validates via DrawBatchSchema.safeParse (normalizeDrawBatch)', () => {
    const el = makePolarPlot();
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test',
      elements: [el],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.elements.length).toBe(1);
    expect(normalized!.elements[0]!.type).toBe('polar_plot');
    const typeWarnings = warnings.filter((w: string) => w.includes('PolarPlot'));
    expect(typeWarnings).toHaveLength(0);
  });
});
