import { describe, it, expect } from 'vitest';
import { DrawBatchSchema, normalizeDrawBatchPayload } from '@/lib/schema';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import {
  lowerMathPrimitive,
  lowerPlannedLayoutToDrawBatch,
  DEFAULT_MAX_LOWERED_ELEMENTS,
} from '@/lib/whiteboard/planner/lowerer';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner/constraints';
import type {
  DrawBatch,
  DrawElement,
  CartesianAxesElement,
  FunctionCurveElement,
  IntegralRegionElement,
  RiemannSumElement,
  VectorArrowElement,
  MatrixBracketElement,
  LinearTransformElement,
  HistogramElement,
  NormalDistributionCurveElement,
} from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLayout(
  elements: DrawElement[],
  opts?: { colorTheme?: DrawBatch['colorTheme'] },
): PlannedSemanticLayout {
  return {
    batchId: 'integ-test',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    semanticBatch: { batch_id: 'integ-test', template: 'freeform_semantic', blocks: [] },
    warnings: [],
  };
}

function allCoordsFinite(elements: DrawElement[]): boolean {
  for (const el of elements) {
    switch (el.type) {
      case 'line':
      case 'arrow':
        if (
          !Number.isFinite(el.from.x) || !Number.isFinite(el.from.y) ||
          !Number.isFinite(el.to.x) || !Number.isFinite(el.to.y)
        ) return false;
        break;
      case 'rect':
        if (
          !Number.isFinite(el.x) || !Number.isFinite(el.y) ||
          !Number.isFinite(el.w) || !Number.isFinite(el.h)
        ) return false;
        break;
      case 'text':
      case 'latex':
        if (!Number.isFinite(el.x) || !Number.isFinite(el.y)) return false;
        break;
      case 'ellipse':
        if (
          !Number.isFinite(el.cx) || !Number.isFinite(el.cy) ||
          !Number.isFinite(el.rx) || !Number.isFinite(el.ry)
        ) return false;
        break;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// 1. Calculus scene
// ---------------------------------------------------------------------------
describe('full pipeline integration', () => {
  it('1 – calculus scene: axes + sin curve + integral + riemann sum', async () => {
    const axes: CartesianAxesElement = {
      id: 'axes1', type: 'cartesian_axes',
      x: 40, y: 40, width: 400, height: 300,
      xRange: [-Math.PI, Math.PI], yRange: [-1.5, 1.5],
    };
    const curve: FunctionCurveElement = {
      id: 'curve1', type: 'function_curve',
      x: 40, y: 40, width: 400, height: 300,
      xRange: [-Math.PI, Math.PI], yRange: [-1.5, 1.5],
      expression: 'sin(x)',
    };
    const integral: IntegralRegionElement = {
      id: 'integral1', type: 'integral_region',
      x: 40, y: 40, width: 400, height: 300,
      xRange: [0, Math.PI], yRange: [-1.5, 1.5],
      expression: 'sin(x)', fillOpacity: 0.3,
    };
    const riemann: RiemannSumElement = {
      id: 'riemann1', type: 'riemann_sum',
      x: 40, y: 40, width: 400, height: 300,
      xRange: [0, Math.PI], yRange: [-1.5, 1.5],
      expression: 'sin(x)', n: 8, method: 'left',
      showFunction: false, showAxes: false,
    };

    // Lower each primitive
    const axesLowered = lowerMathPrimitive(axes);
    const curveLowered = lowerMathPrimitive(curve);
    const integralLowered = lowerMathPrimitive(integral);
    const riemannLowered = lowerMathPrimitive(riemann);

    // Axes produce arrows and ticks
    expect(axesLowered.length).toBeGreaterThan(4);
    expect(axesLowered.some((e) => e.type === 'arrow')).toBe(true);

    // Curve produces ~159 line segments from 160 sample points
    const curveLines = curveLowered.filter((e) => e.type === 'line');
    expect(curveLines.length).toBeGreaterThanOrEqual(100);
    expect(curveLines.length).toBeLessThanOrEqual(160);

    // Integral produces fill lines
    expect(integralLowered.length).toBeGreaterThan(0);

    // Riemann with n=8 produces 8 rects (showFunction=false, showAxes=false)
    const rects = riemannLowered.filter((e) => e.type === 'rect');
    expect(rects).toHaveLength(8);

    // All coordinates finite
    const all = [...axesLowered, ...curveLowered, ...integralLowered, ...riemannLowered];
    expect(allCoordsFinite(all)).toBe(true);

    // Full pipeline through compileBatchToStrokes
    const batch: DrawBatch = {
      batch_id: 'calc-scene',
      elements: [axes, curve, integral, riemann] as DrawElement[],
    };
    const result = await compileBatchToStrokes(batch);
    expect(result.strokes.length).toBeGreaterThan(0);
    for (const s of result.strokes) {
      for (const p of s.points) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  }, 30_000);

  // ---------------------------------------------------------------------------
  // 2. Linear algebra scene
  // ---------------------------------------------------------------------------
  it('2 – linear algebra: rotation transform + vectors + matrix bracket', async () => {
    const theta = Math.PI / 4;
    const transform: LinearTransformElement = {
      id: 'lt1', type: 'linear_transform',
      x: 40, y: 40, width: 300, height: 300,
      matrix: [[Math.cos(theta), -Math.sin(theta)], [Math.sin(theta), Math.cos(theta)]],
      showBasisVectors: true,
    };
    const v1: VectorArrowElement = {
      id: 'v1', type: 'vector_arrow',
      x: 200, y: 200, dx: 80, dy: -60, label: 'u',
    };
    const v2: VectorArrowElement = {
      id: 'v2', type: 'vector_arrow',
      x: 200, y: 200, dx: -40, dy: -90, label: 'v',
    };
    const matrix: MatrixBracketElement = {
      id: 'mat1', type: 'matrix_bracket',
      x: 400, y: 80,
      rows: [
        [String(Math.cos(theta).toFixed(2)), String((-Math.sin(theta)).toFixed(2))],
        [String(Math.sin(theta).toFixed(2)), String(Math.cos(theta).toFixed(2))],
      ],
      bracketStyle: '[]',
    };

    const ltLowered = lowerMathPrimitive(transform);
    const v1Lowered = lowerMathPrimitive(v1);
    const v2Lowered = lowerMathPrimitive(v2);
    const matLowered = lowerMathPrimitive(matrix);

    expect(ltLowered.length).toBeGreaterThan(0);
    // vector_arrow expands to shaft line + two arrowhead lines
    expect(v1Lowered.some((e) => e.type === 'line')).toBe(true);
    expect(v1Lowered.some((e) => e.id.includes('-head-'))).toBe(true);
    expect(v2Lowered.some((e) => e.type === 'line')).toBe(true);
    expect(v2Lowered.some((e) => e.id.includes('-head-'))).toBe(true);
    // Matrix bracket expands to text/latex cells + bracket lines
    expect(matLowered.length).toBeGreaterThan(0);
    expect(matLowered.some((e) => e.type === 'line')).toBe(true);

    // Full pipeline
    const batch: DrawBatch = {
      batch_id: 'linalg-scene',
      elements: [transform, v1, v2, matrix] as DrawElement[],
    };
    const result = await compileBatchToStrokes(batch);
    expect(result.strokes.length).toBeGreaterThan(0);
  }, 30_000);

  // ---------------------------------------------------------------------------
  // 3. Statistics scene
  // ---------------------------------------------------------------------------
  it('3 – statistics: histogram (10 bins) + normal distribution with labels', async () => {
    const bins = Array.from({ length: 10 }, (_, i) => ({
      label: `${i}`, value: Math.round(50 + 40 * Math.exp(-((i - 5) ** 2) / 4)),
    }));
    const histo: HistogramElement = {
      id: 'histo1', type: 'histogram',
      x: 40, y: 40, width: 400, height: 250,
      bins,
    };
    const norm: NormalDistributionCurveElement = {
      id: 'norm1', type: 'normal_distribution',
      x: 40, y: 40, width: 400, height: 250,
      mu: 5, sigma: 1.5,
      showLabels: true, showMeanLine: true, showSigmaLines: true,
    };

    const histoLowered = lowerMathPrimitive(histo);
    const normLowered = lowerMathPrimitive(norm);

    // Histogram produces bars (rects) and optionally text labels
    const bars = histoLowered.filter((e) => e.type === 'rect');
    expect(bars.length).toBeGreaterThanOrEqual(10);

    // Normal distribution produces curve lines
    const curveLines = normLowered.filter((e) => e.type === 'line');
    expect(curveLines.length).toBeGreaterThan(10);

    // σ/μ labels present (showLabels=true produces latex elements with \mu and \sigma)
    const latexEls = normLowered.filter((e) => e.type === 'latex');
    expect(latexEls.length).toBeGreaterThanOrEqual(1);
    const muLabel = latexEls.find(
      (e) => e.type === 'latex' && e.tex?.includes('\\mu'),
    );
    expect(muLabel).toBeDefined();

    // Full pipeline
    const batch: DrawBatch = {
      batch_id: 'stats-scene',
      elements: [histo, norm] as DrawElement[],
    };
    const result = await compileBatchToStrokes(batch);
    expect(result.strokes.length).toBeGreaterThan(0);
  }, 30_000);

  // ---------------------------------------------------------------------------
  // 4. Colorful theme
  // ---------------------------------------------------------------------------
  it('4 – colorful theme: function_curve stroke color ≠ #222', () => {
    // Use lowerPlannedLayoutToDrawBatch which calls expandMathPrimitives
    // and applies getCurveColor for theme colors
    const curve: FunctionCurveElement = {
      id: 'fcol', type: 'function_curve',
      x: 40, y: 40, width: 300, height: 200,
      xRange: [-5, 5], yRange: [-2, 2],
      expression: 'sin(x)',
    };
    const layout = makeLayout([curve as DrawElement]);
    const result = lowerPlannedLayoutToDrawBatch(layout, { colorTheme: 'colorful' });

    const lines = result.elements.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThan(0);
    // With colorful theme, the curve color should NOT be the default dark color
    for (const line of lines) {
      if (line.type === 'line') {
        expect(line.color).toBeDefined();
        expect(line.color).not.toBe('#222');
        expect(line.color).not.toBe('#222222');
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 5. LaTeX labels
  // ---------------------------------------------------------------------------
  it('5 – cartesian_axes with xLabel containing backslash expands as LaTeX', () => {
    const axes: CartesianAxesElement = {
      id: 'axlbl', type: 'cartesian_axes',
      x: 40, y: 40, width: 300, height: 200,
      xRange: [-5, 5], yRange: [-3, 3],
      xLabel: '\\theta',
    };
    const lowered = lowerMathPrimitive(axes);
    const labelEl = lowered.find((e) => e.id === 'axlbl-x-label');
    expect(labelEl).toBeDefined();
    expect(labelEl!.type).toBe('latex');
  });

  // ---------------------------------------------------------------------------
  // 6. Large scene capping
  // ---------------------------------------------------------------------------
  it('6 – batch with 20+ complex elements is capped to ≤ 500 lowered elements', () => {
    // Each function_curve expands to ~159 line segments → 20 curves = ~3180 lines
    const elements: DrawElement[] = [];
    for (let i = 0; i < 22; i++) {
      elements.push({
        id: `fc-${i}`,
        type: 'function_curve',
        x: 40, y: 40, width: 300, height: 200,
        xRange: [-5, 5], yRange: [-2, 2],
        expression: 'sin(x)',
      } as DrawElement);
    }
    const layout = makeLayout(elements);
    const result = lowerPlannedLayoutToDrawBatch(layout);
    expect(result.elements.length).toBeLessThanOrEqual(DEFAULT_MAX_LOWERED_ELEMENTS);
  });

  // ---------------------------------------------------------------------------
  // 7. Multi-diagram: two sub-diagrams positioned in separate regions
  // ---------------------------------------------------------------------------
  it('7 – two diagrams in separate regions do not overlap', async () => {
    // Place two independent axis+curve diagrams in separate regions
    const leftAxes: CartesianAxesElement = {
      id: 'left-axes', type: 'cartesian_axes',
      x: 40, y: 40, width: 250, height: 200,
      xRange: [-5, 5], yRange: [-2, 2],
    };
    const leftCurve: FunctionCurveElement = {
      id: 'left-curve', type: 'function_curve',
      x: 40, y: 40, width: 250, height: 200,
      xRange: [-5, 5], yRange: [-2, 2],
      expression: 'sin(x)',
    };
    const rightAxes: CartesianAxesElement = {
      id: 'right-axes', type: 'cartesian_axes',
      x: 340, y: 40, width: 250, height: 200,
      xRange: [-5, 5], yRange: [-2, 2],
    };
    const rightCurve: FunctionCurveElement = {
      id: 'right-curve', type: 'function_curve',
      x: 340, y: 40, width: 250, height: 200,
      xRange: [-5, 5], yRange: [-2, 2],
      expression: 'x^2',
    };

    const batch: DrawBatch = {
      batch_id: 'multi-diag',
      elements: [leftAxes, leftCurve, rightAxes, rightCurve] as DrawElement[],
    };
    const result = await compileBatchToStrokes(batch);
    expect(result.strokes.length).toBeGreaterThan(0);

    // Verify left diagram strokes stay in left region and right in right region
    const leftStrokes = result.strokes.filter((s) => s.id.startsWith('left-'));
    const rightStrokes = result.strokes.filter((s) => s.id.startsWith('right-'));
    expect(leftStrokes.length).toBeGreaterThan(0);
    expect(rightStrokes.length).toBeGreaterThan(0);

    // Find max x of left diagram and min x of right diagram
    let leftMaxX = -Infinity;
    for (const s of leftStrokes) {
      for (const p of s.points) {
        if (Number.isFinite(p.x)) leftMaxX = Math.max(leftMaxX, p.x);
      }
    }
    let rightMinX = Infinity;
    for (const s of rightStrokes) {
      for (const p of s.points) {
        if (Number.isFinite(p.x)) rightMinX = Math.min(rightMinX, p.x);
      }
    }
    // The two diagrams should occupy distinct horizontal bands
    expect(leftMaxX).toBeLessThan(rightMinX + 50); // allow small margin for arrowheads/labels
  }, 30_000);

  // ---------------------------------------------------------------------------
  // 8. Expression validation: invalid expression
  // ---------------------------------------------------------------------------
  it('8 – function_curve with foo(x) fails DrawBatchSchema.safeParse', () => {
    const payload = {
      batch_id: 'bad-expr',
      elements: [
        {
          id: 'fc-bad', type: 'function_curve',
          x: 40, y: 40, width: 300, height: 200,
          xRange: [-5, 5], yRange: [-2, 2],
          expression: 'foo(x)',
        },
      ],
    };
    const result = DrawBatchSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 9. Implicit multiplication
  // ---------------------------------------------------------------------------
  it('9 – function_curve with expression "2x" samples correctly (no NaN)', () => {
    const curve: FunctionCurveElement = {
      id: 'fc-impl', type: 'function_curve',
      x: 40, y: 40, width: 300, height: 200,
      xRange: [-5, 5], yRange: [-10, 10],
      expression: '2x',
    };
    const lowered = lowerMathPrimitive(curve);
    const lines = lowered.filter((e) => e.type === 'line');
    expect(lines.length).toBeGreaterThan(50);
    // All line coordinates should be finite (no NaN from parsing "2x")
    for (const line of lines) {
      if (line.type !== 'line') continue;
      expect(Number.isFinite(line.from.x)).toBe(true);
      expect(Number.isFinite(line.from.y)).toBe(true);
      expect(Number.isFinite(line.to.x)).toBe(true);
      expect(Number.isFinite(line.to.y)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 10. Dark theme canvas
  // ---------------------------------------------------------------------------
  it('10 – dark theme batch compiles without error', async () => {
    const batch: DrawBatch = {
      batch_id: 'dark-test',
      colorTheme: 'dark',
      elements: [
        {
          id: 'dark-axes', type: 'cartesian_axes',
          x: 40, y: 40, width: 300, height: 200,
          xRange: [-5, 5], yRange: [-2, 2],
        } as DrawElement,
        {
          id: 'dark-curve', type: 'function_curve',
          x: 40, y: 40, width: 300, height: 200,
          xRange: [-5, 5], yRange: [-2, 2],
          expression: 'cos(x)',
        } as DrawElement,
      ],
    };
    const result = await compileBatchToStrokes(batch);
    expect(result.strokes.length).toBeGreaterThan(0);
    // Should not throw and should produce valid strokes
    for (const s of result.strokes) {
      for (const p of s.points) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  }, 30_000);
});
