import { describe, it, expect } from 'vitest';
import { lowerMathPrimitive } from '../planner/lowerer';
import { normalizeDrawBatchPayload } from '@/lib/schema';
import type { SequencePlotElement, BezierCurveElement } from '@/types/agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSequencePlot(
  overrides: Partial<SequencePlotElement> = {},
): SequencePlotElement {
  return {
    id: 'test-seq',
    type: 'sequence_plot',
    expression: '1/n',
    x: 100,
    y: 100,
    width: 600,
    height: 300,
    ...overrides,
  };
}

function makeBezierCurve(
  overrides: Partial<BezierCurveElement> = {},
): BezierCurveElement {
  return {
    id: 'test-bezier',
    type: 'bezier_curve',
    points: [
      [100, 400],
      [200, 100],
      [400, 100],
      [500, 400],
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sequence_plot tests
// ---------------------------------------------------------------------------
describe('expandSequencePlot (via lowerMathPrimitive)', () => {
  it('expression="1/n", nMin=1, nMax=10 → 10 dots + axis elements', () => {
    const el = makeSequencePlot({ nMin: 1, nMax: 10 });
    const result = lowerMathPrimitive(el);
    const dots = result.filter((e) => e.type === 'ellipse');
    expect(dots.length).toBe(10);
    // Should include axis line and tick marks
    const axis = result.filter((e) => e.id.includes('-axis'));
    expect(axis.length).toBeGreaterThanOrEqual(1);
  });

  it('all coordinates are finite (no NaN)', () => {
    const el = makeSequencePlot({ nMin: 1, nMax: 20 });
    const result = lowerMathPrimitive(el);
    for (const e of result) {
      if (e.type === 'ellipse') {
        expect(Number.isFinite(e.cx)).toBe(true);
        expect(Number.isFinite(e.cy)).toBe(true);
      }
      if (e.type === 'line') {
        expect(Number.isFinite(e.from.x)).toBe(true);
        expect(Number.isFinite(e.from.y)).toBe(true);
        expect(Number.isFinite(e.to.x)).toBe(true);
        expect(Number.isFinite(e.to.y)).toBe(true);
      }
    }
  });

  it('with limit → includes dashed line', () => {
    const el = makeSequencePlot({ limit: 0 });
    const result = lowerMathPrimitive(el);
    const limitLine = result.find((e) => e.id.includes('-limit') && e.type === 'line');
    expect(limitLine).toBeDefined();
    if (limitLine && limitLine.type === 'line') {
      expect(limitLine.lineStyle).toBe('dashed');
    }
    // Should also have a label for the limit value
    const limitLabel = result.find((e) => e.id.includes('-limit-label'));
    expect(limitLabel).toBeDefined();
  });

  it('defaults nMin=1, nMax=20 when not provided', () => {
    const el = makeSequencePlot();
    const result = lowerMathPrimitive(el);
    const dots = result.filter((e) => e.type === 'ellipse');
    expect(dots.length).toBe(20);
  });

  it('showLines connects dots with line segments', () => {
    const el = makeSequencePlot({ nMin: 1, nMax: 5, showLines: true });
    const result = lowerMathPrimitive(el);
    const connectingLines = result.filter((e) => e.type === 'line' && e.id.includes('-line-'));
    expect(connectingLines.length).toBe(4); // 5 dots → 4 connecting lines
  });

  it('handles alternating sequence (-1)^n/n', () => {
    const el = makeSequencePlot({ expression: '(-1)^n/n', nMin: 1, nMax: 10 });
    const result = lowerMathPrimitive(el);
    const dots = result.filter((e) => e.type === 'ellipse');
    expect(dots.length).toBe(10);
  });

  it('schema validates sequence_plot required fields', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test-batch',
      elements: [
        {
          id: 'seq-1',
          type: 'sequence_plot',
          expression: '1/n',
          x: 100,
          y: 100,
          width: 600,
          height: 300,
        },
      ],
    });
    expect(normalized.elements.length).toBe(1);
    expect(normalized.elements[0]!.type).toBe('sequence_plot');
    expect(warnings.filter((w) => w.includes('invalid'))).toHaveLength(0);
  });

  it('schema rejects sequence_plot without expression', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test-batch',
      elements: [
        {
          id: 'seq-bad',
          type: 'sequence_plot',
          x: 100,
          y: 100,
          width: 600,
          height: 300,
        },
      ],
    });
    expect(normalized.elements.length).toBe(0);
    expect(warnings.some((w) => w.includes('SequencePlot'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bezier_curve tests
// ---------------------------------------------------------------------------
describe('expandBezierCurve (via lowerMathPrimitive)', () => {
  it('4 control points → ~80 curve line segments', () => {
    const el = makeBezierCurve();
    const result = lowerMathPrimitive(el);
    const curveLines = result.filter((e) => e.type === 'line' && e.id.includes('-seg'));
    expect(curveLines.length).toBeGreaterThanOrEqual(70);
    expect(curveLines.length).toBeLessThanOrEqual(90);
  });

  it('all line coordinates are finite (no NaN)', () => {
    const el = makeBezierCurve();
    const result = lowerMathPrimitive(el);
    for (const e of result) {
      if (e.type === 'line') {
        expect(Number.isFinite(e.from.x)).toBe(true);
        expect(Number.isFinite(e.from.y)).toBe(true);
        expect(Number.isFinite(e.to.x)).toBe(true);
        expect(Number.isFinite(e.to.y)).toBe(true);
      }
    }
  });

  it('showControlPoints → includes control polygon lines and dots', () => {
    const el = makeBezierCurve({ showControlPoints: true });
    const result = lowerMathPrimitive(el);
    const cpLines = result.filter((e) => e.id.includes('-cp-line-'));
    const cpDots = result.filter((e) => e.id.includes('-cp-dot-'));
    // 4 control points → 3 polygon lines and 4 dots
    expect(cpLines.length).toBe(3);
    expect(cpDots.length).toBe(4);
    // Control polygon lines should be dashed
    for (const l of cpLines) {
      if (l.type === 'line') {
        expect(l.lineStyle).toBe('dashed');
      }
    }
  });

  it('showTangents → includes tangent lines at endpoints', () => {
    const el = makeBezierCurve({ showTangents: true });
    const result = lowerMathPrimitive(el);
    const tangentStart = result.find((e) => e.id.includes('-tangent-start'));
    const tangentEnd = result.find((e) => e.id.includes('-tangent-end'));
    expect(tangentStart).toBeDefined();
    expect(tangentEnd).toBeDefined();
  });

  it('quadratic bezier (3 points) works', () => {
    const el = makeBezierCurve({
      points: [
        [100, 400],
        [300, 100],
        [500, 400],
      ],
    });
    const result = lowerMathPrimitive(el);
    const curveLines = result.filter((e) => e.type === 'line' && e.id.includes('-seg'));
    expect(curveLines.length).toBeGreaterThanOrEqual(70);
  });

  it('schema validates bezier_curve required fields', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test-batch',
      elements: [
        {
          id: 'bez-1',
          type: 'bezier_curve',
          points: [[100, 400], [200, 100], [400, 100], [500, 400]],
        },
      ],
    });
    expect(normalized.elements.length).toBe(1);
    expect(normalized.elements[0]!.type).toBe('bezier_curve');
    expect(warnings.filter((w) => w.includes('invalid'))).toHaveLength(0);
  });

  it('schema rejects bezier_curve with fewer than 3 points', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test-batch',
      elements: [
        {
          id: 'bez-bad',
          type: 'bezier_curve',
          points: [[100, 200], [300, 400]],
        },
      ],
    });
    expect(normalized.elements.length).toBe(0);
    expect(warnings.some((w) => w.includes('BezierCurve'))).toBe(true);
  });
});
