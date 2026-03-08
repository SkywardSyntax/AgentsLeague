import { describe, it, expect } from 'vitest';
import type { DrawElement, RiemannSumElement, TangentLineElement, IntegralRegionElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';
import { lowerPlannedLayoutToDrawBatch, lowerMathPrimitive } from '../planner/lowerer';
import { parseMathExpression } from '../graph-script';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLayout(elements: DrawElement[]): PlannedSemanticLayout {
  return {
    batchId: 'test-batch',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    semanticBatch: { batch_id: 'test-batch', template: 'freeform_semantic', blocks: [] },
    warnings: [],
  };
}

function lowerSingle(el: DrawElement) {
  const layout = makeLayout([el]);
  return lowerPlannedLayoutToDrawBatch(layout, { maxElements: 800 });
}

function countByType(elements: DrawElement[], type: string) {
  return elements.filter((e) => e.type === type).length;
}

// ===========================================================================
// riemann_sum
// ===========================================================================
describe('expandRiemannSum', () => {
  const base: RiemannSumElement = {
    id: 'rs-1',
    type: 'riemann_sum',
    x: 50,
    y: 50,
    width: 400,
    height: 300,
    xRange: [1, 6],
    yRange: [0, 36],
    expression: 'x^2',
    n: 5,
    method: 'left',
    showFunction: true,
    showAxes: false,
  };

  it('produces exactly 5 rect elements for n=5', () => {
    const batch = lowerSingle(base);
    const rects = batch.elements.filter((e) => e.type === 'rect' && e.id.startsWith('rs-1-rect-'));
    expect(rects).toHaveLength(5);
  });

  it('produces rect elements with valid dimensions', () => {
    const batch = lowerSingle(base);
    const rects = batch.elements.filter((e) => e.type === 'rect' && e.id.startsWith('rs-1-rect-'));
    for (const r of rects) {
      if (r.type !== 'rect') continue;
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.x)).toBe(true);
      expect(Number.isFinite(r.y)).toBe(true);
    }
  });

  it('also draws function curve when showFunction=true', () => {
    const batch = lowerSingle(base);
    const curveLines = batch.elements.filter((e) => e.type === 'line' && e.id.startsWith('rs-1-curve-'));
    expect(curveLines.length).toBeGreaterThan(10);
  });

  it('draws axes when showAxes=true', () => {
    const withAxes: RiemannSumElement = { ...base, showAxes: true };
    const batch = lowerSingle(withAxes);
    const axisLines = batch.elements.filter((e) => e.id.startsWith('rs-1-axes-'));
    expect(axisLines.length).toBeGreaterThan(0);
  });

  it('respects method="right"', () => {
    const right: RiemannSumElement = { ...base, method: 'right', showFunction: false, showAxes: false };
    const batch = lowerSingle(right);
    const rects = batch.elements.filter((e) => e.type === 'rect' && e.id.startsWith('rs-1-rect-'));
    expect(rects).toHaveLength(5);
  });

  it('respects method="midpoint"', () => {
    const mid: RiemannSumElement = { ...base, method: 'midpoint', showFunction: false, showAxes: false };
    const batch = lowerSingle(mid);
    const rects = batch.elements.filter((e) => e.type === 'rect' && e.id.startsWith('rs-1-rect-'));
    expect(rects).toHaveLength(5);
  });

  it('returns empty for invalid expression', () => {
    const invalid: RiemannSumElement = { ...base, expression: '???invalid' };
    const result = lowerMathPrimitive(invalid);
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// tangent_line
// ===========================================================================
describe('expandTangentLine', () => {
  const base: TangentLineElement = {
    id: 'tl-1',
    type: 'tangent_line',
    x: 50,
    y: 50,
    width: 400,
    height: 300,
    xRange: [-1, 5],
    yRange: [-1, 25],
    expression: 'x^2',
    atX: 2,
    showPoint: true,
    label: "f'(2) = 4",
  };

  it('computes slope ≈ 4 for x^2 at x=2', () => {
    // Verify the numerical derivative directly
    const fn = parseMathExpression('x^2')!;
    const h = 1e-5;
    const slope = (fn(2 + h) - fn(2 - h)) / (2 * h);
    expect(slope).toBeCloseTo(4, 3);
  });

  it('produces a tangent line element', () => {
    const result = lowerMathPrimitive(base);
    const tangentLine = result.find((e) => e.id === 'tl-1-tangent');
    expect(tangentLine).toBeDefined();
    expect(tangentLine!.type).toBe('line');
  });

  it('produces a point of tangency ellipse when showPoint=true', () => {
    const result = lowerMathPrimitive(base);
    const point = result.find((e) => e.id === 'tl-1-point');
    expect(point).toBeDefined();
    expect(point!.type).toBe('ellipse');
  });

  it('omits point when showPoint=false', () => {
    const noPoint: TangentLineElement = { ...base, showPoint: false };
    const result = lowerMathPrimitive(noPoint);
    const point = result.find((e) => e.id === 'tl-1-point');
    expect(point).toBeUndefined();
  });

  it('produces a label text element', () => {
    const result = lowerMathPrimitive(base);
    const label = result.find((e) => e.id === 'tl-1-label');
    expect(label).toBeDefined();
    expect(label!.type).toBe('text');
    if (label!.type === 'text') {
      expect(label!.text).toBe("f'(2) = 4");
    }
  });

  it('returns empty for invalid expression', () => {
    const invalid: TangentLineElement = { ...base, expression: '???bad' };
    const result = lowerMathPrimitive(invalid);
    expect(result).toHaveLength(0);
  });

  it('tangent line endpoints reflect the computed slope', () => {
    const result = lowerMathPrimitive(base);
    const tangent = result.find((e) => e.id === 'tl-1-tangent');
    expect(tangent).toBeDefined();
    if (tangent && tangent.type === 'line') {
      // The line should have different from/to y values since slope != 0
      expect(tangent.from.y).not.toBeCloseTo(tangent.to.y, 0);
    }
  });
});

// ===========================================================================
// improved integral_region
// ===========================================================================
describe('expandIntegralRegion (improved)', () => {
  const baseWithExpression: IntegralRegionElement = {
    id: 'ir-1',
    type: 'integral_region',
    x: 50,
    y: 50,
    width: 400,
    height: 300,
    xRange: [0, 3],
    yRange: [0, 10],
    expression: 'x^2',
  };

  it('works with expression instead of topPoints', () => {
    const result = lowerMathPrimitive(baseWithExpression);
    expect(result.length).toBeGreaterThan(0);
  });

  it('produces vertical fill lines', () => {
    const result = lowerMathPrimitive(baseWithExpression);
    const fills = result.filter((e) => e.id.startsWith('ir-1-fill-'));
    expect(fills.length).toBeGreaterThan(10);
    expect(fills.every((e) => e.type === 'line')).toBe(true);
  });

  it('produces top boundary curve segments', () => {
    const result = lowerMathPrimitive(baseWithExpression);
    const tops = result.filter((e) => e.id.startsWith('ir-1-top-'));
    expect(tops.length).toBeGreaterThan(5);
  });

  it('produces left and right edges', () => {
    const result = lowerMathPrimitive(baseWithExpression);
    expect(result.find((e) => e.id === 'ir-1-left-edge')).toBeDefined();
    expect(result.find((e) => e.id === 'ir-1-right-edge')).toBeDefined();
  });

  it('produces bottom line', () => {
    const result = lowerMathPrimitive(baseWithExpression);
    expect(result.find((e) => e.id === 'ir-1-bottom')).toBeDefined();
  });

  it('produces tick marks and labels at a and b', () => {
    const result = lowerMathPrimitive(baseWithExpression);
    expect(result.find((e) => e.id === 'ir-1-tick-a')).toBeDefined();
    expect(result.find((e) => e.id === 'ir-1-tick-b')).toBeDefined();
    const labelA = result.find((e) => e.id === 'ir-1-label-a');
    const labelB = result.find((e) => e.id === 'ir-1-label-b');
    expect(labelA).toBeDefined();
    expect(labelB).toBeDefined();
    if (labelA?.type === 'text') expect(labelA.text).toBe('a');
    if (labelB?.type === 'text') expect(labelB.text).toBe('b');
  });

  it('uses custom aLabel and bLabel', () => {
    const custom: IntegralRegionElement = { ...baseWithExpression, aLabel: '0', bLabel: '3' };
    const result = lowerMathPrimitive(custom);
    const labelA = result.find((e) => e.id === 'ir-1-label-a');
    const labelB = result.find((e) => e.id === 'ir-1-label-b');
    if (labelA?.type === 'text') expect(labelA.text).toBe('0');
    if (labelB?.type === 'text') expect(labelB.text).toBe('3');
  });

  it('still works with topPoints (backward compatibility)', () => {
    const withPoints: IntegralRegionElement = {
      ...baseWithExpression,
      expression: undefined,
      topPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 4 },
        { x: 3, y: 9 },
      ],
    };
    const result = lowerMathPrimitive(withPoints);
    expect(result.length).toBeGreaterThan(0);
    const fills = result.filter((e) => e.id.startsWith('ir-1-fill-'));
    expect(fills.length).toBeGreaterThan(0);
  });

  it('contains no NaN values', () => {
    const result = lowerMathPrimitive(baseWithExpression);
    const json = JSON.stringify(result);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('null');
  });
});
