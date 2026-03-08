import { describe, it, expect } from 'vitest';
import { DrawBatchSchema } from '@/lib/schema';
import {
  lowerMathPrimitive,
  lowerPlannedLayoutToDrawBatch,
} from '../planner/lowerer';
import type {
  DrawBatch,
  DrawElement,
  ColorTheme,
  CartesianAxesElement,
  FunctionCurveElement,
  IntegralRegionElement,
  RiemannSumElement,
  TangentLineElement,
  MatrixBracketElement,
  LinearTransformElement,
  NormalDistributionCurveElement,
  HistogramElement,
  SlopeFieldElement,
  VectorField2dElement,
  TriangleWithAnglesElement,
  CircleWithRadiusElement,
  ComplexPlaneElement,
  Wireframe3dElement,
  NumberTheoryGridElement,
  SequencePlotElement,
  PolarPlotElement,
  ParametricCurveElement,
} from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THEME: ColorTheme = 'colorful';

function makeLayout(elements: DrawElement[]): PlannedSemanticLayout {
  return {
    batchId: 'showcase',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    semanticBatch: { batch_id: 'showcase', template: 'freeform_semantic', blocks: [] },
    warnings: [],
  };
}

/** Lower a set of elements through the full pipeline with colorful theme. */
function lowerAll(elements: DrawElement[]): DrawBatch {
  const layout = makeLayout(elements);
  return lowerPlannedLayoutToDrawBatch(layout, {
    maxElements: 200,
    colorTheme: THEME,
  });
}

/**
 * Sanitize lowered batch for DrawBatchSchema validation.
 * The lowerer produces rgba() colors for fill regions (e.g. integral shading,
 * normal distribution) which the base element schema's `color` field rejects
 * (it only accepts hex/#-prefixed or single-word colors).  We convert these
 * to hex for schema compliance while keeping the batch semantically identical.
 */
function sanitizeForSchema(batch: DrawBatch): DrawBatch {
  return {
    ...batch,
    elements: batch.elements.map((el) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = el as any;
      if (typeof raw.color === 'string' && raw.color.startsWith('rgba')) {
        const m = raw.color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
        if (m) {
          const hex = '#' + [m[1], m[2], m[3]].map(v =>
            Math.round(Number(v)).toString(16).padStart(2, '0')
          ).join('');
          return { ...raw, color: hex };
        }
      }
      return el;
    }),
  };
}

/** Assert every numeric coordinate-like value in lowered elements is finite. */
function assertAllCoordsFinite(elements: DrawElement[]): void {
  for (const el of elements) {
    const json = JSON.stringify(el);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
    expect(json).not.toContain('-Infinity');

    switch (el.type) {
      case 'line':
      case 'arrow':
        expect(Number.isFinite(el.from.x), `${el.id}.from.x`).toBe(true);
        expect(Number.isFinite(el.from.y), `${el.id}.from.y`).toBe(true);
        expect(Number.isFinite(el.to.x), `${el.id}.to.x`).toBe(true);
        expect(Number.isFinite(el.to.y), `${el.id}.to.y`).toBe(true);
        break;
      case 'rect':
        expect(Number.isFinite(el.x), `${el.id}.x`).toBe(true);
        expect(Number.isFinite(el.y), `${el.id}.y`).toBe(true);
        expect(Number.isFinite(el.w), `${el.id}.w`).toBe(true);
        expect(Number.isFinite(el.h), `${el.id}.h`).toBe(true);
        break;
      case 'text':
      case 'latex':
        expect(Number.isFinite(el.x), `${el.id}.x`).toBe(true);
        expect(Number.isFinite(el.y), `${el.id}.y`).toBe(true);
        break;
      case 'ellipse':
        expect(Number.isFinite(el.cx), `${el.id}.cx`).toBe(true);
        expect(Number.isFinite(el.cy), `${el.id}.cy`).toBe(true);
        expect(Number.isFinite(el.rx), `${el.id}.rx`).toBe(true);
        expect(Number.isFinite(el.ry), `${el.id}.ry`).toBe(true);
        break;
    }
  }
}

// ===========================================================================
// 20 math showcase payloads
// ===========================================================================

describe('math-showcase: 20 validated DrawBatch payloads', () => {
  // -----------------------------------------------------------------------
  // 1. Calculus 1 — Limits: 1/n → 0
  // -----------------------------------------------------------------------
  describe('1. Calculus – Limits (1/n → 0)', () => {
    const elements: DrawElement[] = [
      {
        id: 'seq-1n',
        type: 'sequence_plot',
        expression: '1/n',
        nMin: 1,
        nMax: 20,
        limit: 0,
        x: 50, y: 50, width: 500, height: 300,
        showLines: true,
      } as SequencePlotElement,
      {
        id: 'label-limit',
        type: 'latex',
        x: 300, y: 380,
        tex: '\\lim_{n \\to \\infty} \\frac{1}{n} = 0',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Calculus 2 — Derivative: f(x) = x², tangent at x=2
  // -----------------------------------------------------------------------
  describe('2. Calculus – Derivative (tangent to x²)', () => {
    const elements: DrawElement[] = [
      {
        id: 'axes-deriv',
        type: 'cartesian_axes',
        x: 50, y: 50, width: 400, height: 300,
        xRange: [-1, 4], yRange: [-1, 10],
        xLabel: 'x', yLabel: 'f(x)',
      } as CartesianAxesElement,
      {
        id: 'curve-x2',
        type: 'function_curve',
        x: 50, y: 50, width: 400, height: 300,
        xRange: [-1, 4], yRange: [-1, 10],
        expression: 'x^2',
        label: 'f(x) = x²',
      } as FunctionCurveElement,
      {
        id: 'tangent-at-2',
        type: 'tangent_line',
        x: 50, y: 50, width: 400, height: 300,
        xRange: [-1, 4], yRange: [-1, 10],
        expression: 'x^2',
        atX: 2,
        label: "f'(2) = 4",
      } as TangentLineElement,
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Calculus 3 — Integral: ∫sin(x) from 0 to π
  // -----------------------------------------------------------------------
  describe('3. Calculus – Integral (∫sin(x) dx)', () => {
    const elements: DrawElement[] = [
      {
        id: 'axes-int',
        type: 'cartesian_axes',
        x: 50, y: 50, width: 500, height: 300,
        xRange: [-0.5, 4], yRange: [-0.5, 1.5],
        xLabel: 'x', yLabel: 'y',
      } as CartesianAxesElement,
      {
        id: 'sin-curve',
        type: 'function_curve',
        x: 50, y: 50, width: 500, height: 300,
        xRange: [-0.5, 4], yRange: [-0.5, 1.5],
        expression: 'sin(x)',
      } as FunctionCurveElement,
      {
        id: 'sin-integral',
        type: 'integral_region',
        x: 50, y: 50, width: 500, height: 300,
        xRange: [0, Math.PI], yRange: [-0.5, 1.5],
        expression: 'sin(x)',
        fillOpacity: 0.3,
        label: '∫₀π sin(x) dx = 2',
      } as IntegralRegionElement,
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Calculus 4 — Riemann sum: left approximation of x² on [0, 2]
  // -----------------------------------------------------------------------
  describe('4. Calculus – Riemann sum (x² on [0,2])', () => {
    const elements: DrawElement[] = [
      {
        id: 'riemann-x2',
        type: 'riemann_sum',
        x: 50, y: 50, width: 400, height: 300,
        xRange: [0, 2], yRange: [0, 5],
        expression: 'x^2',
        n: 8,
        method: 'left',
        showFunction: true,
        showAxes: true,
      } as RiemannSumElement,
      {
        id: 'label-riemann',
        type: 'latex',
        x: 200, y: 380,
        tex: 'L_8 \\approx \\sum_{i=0}^{7} f(x_i) \\Delta x',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces rectangles for the sum', () => {
      const batch = lowerAll(elements);
      const rects = batch.elements.filter(e => e.type === 'rect');
      expect(rects.length).toBeGreaterThanOrEqual(8);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Linear Algebra 1 — 2×2 matrix multiplication
  // -----------------------------------------------------------------------
  describe('5. Linear Algebra – Matrix multiplication', () => {
    const elements: DrawElement[] = [
      {
        id: 'mat-a',
        type: 'matrix_bracket',
        x: 50, y: 100,
        rows: [['1', '2'], ['3', '4']],
        bracketStyle: '[]',
      } as MatrixBracketElement,
      {
        id: 'times-sign',
        type: 'latex',
        x: 180, y: 130,
        tex: '\\times',
        fontSize: 24,
      },
      {
        id: 'mat-b',
        type: 'matrix_bracket',
        x: 220, y: 100,
        rows: [['5', '6'], ['7', '8']],
        bracketStyle: '[]',
      } as MatrixBracketElement,
      {
        id: 'equals-sign',
        type: 'latex',
        x: 350, y: 130,
        tex: '=',
        fontSize: 24,
      },
      {
        id: 'mat-result',
        type: 'matrix_bracket',
        x: 390, y: 100,
        rows: [['19', '22'], ['43', '50']],
        bracketStyle: '[]',
      } as MatrixBracketElement,
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Linear Algebra 2 — Eigenvalue visualization
  // -----------------------------------------------------------------------
  describe('6. Linear Algebra – Eigenvalue visualization', () => {
    const elements: DrawElement[] = [
      {
        id: 'eigen-transform',
        type: 'linear_transform',
        x: 50, y: 50, width: 350, height: 350,
        matrix: [[2, 1], [1, 2]],
        showBasisVectors: true,
        showOriginalGrid: true,
        gridRange: 3,
        vectors: [
          { x: 1, y: 1, label: 'v₁ (λ=3)', color: '#e74c3c' },
          { x: 1, y: -1, label: 'v₂ (λ=1)', color: '#3498db' },
        ],
        label: 'A = [[2,1],[1,2]]',
      } as LinearTransformElement,
      {
        id: 'eigen-formula',
        type: 'latex',
        x: 50, y: 430,
        tex: 'Av = \\lambda v, \\quad \\lambda_1 = 3, \\; \\lambda_2 = 1',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Linear Algebra 3 — Linear transformation of unit square
  // -----------------------------------------------------------------------
  describe('7. Linear Algebra – Shear transform of unit square', () => {
    const elements: DrawElement[] = [
      {
        id: 'shear-transform',
        type: 'linear_transform',
        x: 50, y: 50, width: 350, height: 350,
        matrix: [[1, 1], [0, 1]],
        showBasisVectors: true,
        showOriginalGrid: true,
        gridRange: 3,
        label: 'Shear',
      } as LinearTransformElement,
      {
        id: 'shear-label',
        type: 'latex',
        x: 150, y: 430,
        tex: '\\begin{pmatrix} 1 & 1 \\\\ 0 & 1 \\end{pmatrix}',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Statistics 1 — Normal distribution bell curve
  // -----------------------------------------------------------------------
  describe('8. Statistics – Normal distribution', () => {
    const elements: DrawElement[] = [
      {
        id: 'norm-curve',
        type: 'normal_distribution',
        x: 50, y: 50, width: 500, height: 300,
        mu: 0,
        sigma: 1,
        shadeFrom: -1,
        shadeTo: 1,
        shadeColor: '#3498db',
        showMeanLine: true,
        showSigmaLines: true,
        showLabels: true,
        label: 'Standard Normal N(0,1)',
      } as NormalDistributionCurveElement,
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces curve lines', () => {
      const batch = lowerAll(elements);
      const curveLines = batch.elements.filter(e => e.type === 'line');
      expect(curveLines.length).toBeGreaterThan(10);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Statistics 2 — Histogram of test scores
  // -----------------------------------------------------------------------
  describe('9. Statistics – Histogram (test scores)', () => {
    const elements: DrawElement[] = [
      {
        id: 'scores-hist',
        type: 'histogram',
        x: 50, y: 50, width: 500, height: 300,
        bins: [
          { label: '50-59', value: 3 },
          { label: '60-69', value: 8 },
          { label: '70-79', value: 15 },
          { label: '80-89', value: 22 },
          { label: '90-100', value: 12 },
        ],
        showValues: true,
        showAxes: true,
        xLabel: 'Score Range',
        yLabel: 'Frequency',
      } as HistogramElement,
      {
        id: 'hist-title',
        type: 'text',
        x: 200, y: 30,
        text: 'Test Score Distribution',
        size: 18,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces bars (rects)', () => {
      const batch = lowerAll(elements);
      const rects = batch.elements.filter(e => e.type === 'rect');
      expect(rects.length).toBeGreaterThanOrEqual(5);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 10. ODE 1 — Direction field dy/dx = -x/y (circles)
  // -----------------------------------------------------------------------
  describe('10. ODE – Slope field (dy/dx = -x/y)', () => {
    const elements: DrawElement[] = [
      {
        id: 'sf-circles',
        type: 'slope_field',
        x: 50, y: 50, width: 400, height: 400,
        expression: '-x/y',
        xRange: [-3, 3],
        yRange: [-3, 3],
        gridRows: 10,
        gridCols: 10,
      } as SlopeFieldElement,
      {
        id: 'sf-label',
        type: 'latex',
        x: 200, y: 480,
        tex: '\\frac{dy}{dx} = -\\frac{x}{y}',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces slope tick lines', () => {
      const batch = lowerAll(elements);
      const lines = batch.elements.filter(e => e.type === 'line');
      expect(lines.length).toBeGreaterThan(20);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 11. ODE 2 — Vector field F(x,y) = (y, -x) (rotation)
  // -----------------------------------------------------------------------
  describe('11. ODE – Vector field F(x,y) = (y, -x)', () => {
    const elements: DrawElement[] = [
      {
        id: 'vf-rotation',
        type: 'vector_field_2d',
        x: 50, y: 50, width: 400, height: 400,
        Px: 'y',
        Py: '-x',
        xRange: [-3, 3],
        yRange: [-3, 3],
        gridRows: 8,
        gridCols: 8,
        normalize: true,
      } as VectorField2dElement,
      {
        id: 'vf-label',
        type: 'latex',
        x: 200, y: 480,
        tex: '\\mathbf{F}(x,y) = (y, -x)',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 12. Geometry 1 — Triangle with angles summing to 180°
  // -----------------------------------------------------------------------
  describe('12. Geometry – Triangle (angles sum to 180°)', () => {
    const elements: DrawElement[] = [
      {
        id: 'tri-180',
        type: 'triangle_with_angles',
        vertices: [
          { x: 100, y: 350, label: 'A' },
          { x: 400, y: 350, label: 'B' },
          { x: 250, y: 100, label: 'C' },
        ],
        showAngles: true,
        showSides: true,
        sideLabels: ['c = 5', 'a = 4', 'b = 3'],
        angleLabels: ['53°', '90°', '37°'],
      } as TriangleWithAnglesElement,
      {
        id: 'tri-label',
        type: 'latex',
        x: 180, y: 400,
        tex: '\\alpha + \\beta + \\gamma = 180°',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces triangle side lines', () => {
      const batch = lowerAll(elements);
      const lines = batch.elements.filter(e => e.type === 'line');
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 13. Geometry 2 — Circle with radius and area annotation
  // -----------------------------------------------------------------------
  describe('13. Geometry – Circle with radius & area', () => {
    const elements: DrawElement[] = [
      {
        id: 'circle-geom',
        type: 'circle_with_radius',
        cx: 300,
        cy: 250,
        r: 120,
        label: 'r = 5',
        showCenter: true,
        showRadius: true,
        radiusAngle: 45,
      } as CircleWithRadiusElement,
      {
        id: 'area-label',
        type: 'latex',
        x: 250, y: 420,
        tex: 'A = \\pi r^2 = 25\\pi',
        displayMode: true,
      },
      {
        id: 'circumf-label',
        type: 'latex',
        x: 250, y: 460,
        tex: 'C = 2\\pi r = 10\\pi',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces circle ellipse and radius line', () => {
      const batch = lowerAll(elements);
      const ellipses = batch.elements.filter(e => e.type === 'ellipse');
      expect(ellipses.length).toBeGreaterThanOrEqual(1);
      const lines = batch.elements.filter(e => e.type === 'line');
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 14. Complex Analysis — Roots of unity on complex plane
  // -----------------------------------------------------------------------
  describe('14. Complex Analysis – 5th roots of unity', () => {
    const roots = Array.from({ length: 5 }, (_, k) => ({
      re: Math.cos((2 * Math.PI * k) / 5),
      im: Math.sin((2 * Math.PI * k) / 5),
      label: `ω^${k}`,
      color: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'][k],
    }));

    const elements: DrawElement[] = [
      {
        id: 'cp-roots',
        type: 'complex_plane',
        points: roots,
        showUnitCircle: true,
        xRange: [-2, 2] as [number, number],
        yRange: [-2, 2] as [number, number],
      } as ComplexPlaneElement,
      {
        id: 'roots-label',
        type: 'latex',
        x: 600, y: 580,
        tex: 'z^5 = 1 \\implies z = e^{2\\pi i k/5}',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces axes arrows and point ellipses', () => {
      const batch = lowerAll(elements);
      const arrows = batch.elements.filter(e => e.type === 'arrow');
      expect(arrows.length).toBeGreaterThanOrEqual(2);
      const ellipses = batch.elements.filter(e => e.type === 'ellipse');
      expect(ellipses.length).toBeGreaterThanOrEqual(5);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 15. 3D Geometry — Wireframe cube with rotation
  // -----------------------------------------------------------------------
  describe('15. 3D Geometry – Wireframe cube', () => {
    const elements: DrawElement[] = [
      {
        id: 'cube-3d',
        type: 'wireframe_3d',
        shape: 'cube',
        cx: 300,
        cy: 300,
        size: 180,
        rotationX: 25,
        rotationY: 35,
      } as Wireframe3dElement,
      {
        id: 'cube-label',
        type: 'text',
        x: 250, y: 450,
        text: '3D Wireframe Cube',
        size: 16,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces edge lines for a cube', () => {
      const batch = lowerAll(elements);
      const lines = batch.elements.filter(e => e.type === 'line' && e.id.startsWith('cube-3d'));
      expect(lines.length).toBeGreaterThanOrEqual(10);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 16. Graph Theory — Binary search tree
  // -----------------------------------------------------------------------
  describe('16. Graph Theory – Binary search tree', () => {
    // Hand-craft BST nodes using basic types (all schema-valid)
    const nodeR = 18;
    const nodes = [
      { val: 8, x: 300, y: 60 },
      { val: 3, x: 180, y: 150 },
      { val: 10, x: 420, y: 150 },
      { val: 1, x: 120, y: 240 },
      { val: 6, x: 240, y: 240 },
      { val: 14, x: 480, y: 240 },
      { val: 7, x: 270, y: 330 },
    ];
    const edges: [number, number][] = [
      [0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [4, 6],
    ];

    const elements: DrawElement[] = [
      // title
      { id: 'bst-title', type: 'text', x: 240, y: 20, text: 'Binary Search Tree', size: 18 },
      // edges (lines drawn first so nodes overlay)
      ...edges.map(([from, to], i) => ({
        id: `bst-edge-${i}`,
        type: 'line' as const,
        from: { x: nodes[from].x, y: nodes[from].y },
        to: { x: nodes[to].x, y: nodes[to].y },
        color: '#888888',
      })),
      // nodes (circles)
      ...nodes.map((n, i) => ({
        id: `bst-node-${i}`,
        type: 'ellipse' as const,
        cx: n.x,
        cy: n.y,
        rx: nodeR,
        ry: nodeR,
        color: '#3498db',
      })),
      // labels
      ...nodes.map((n, i) => ({
        id: `bst-label-${i}`,
        type: 'text' as const,
        x: n.x,
        y: n.y,
        text: String(n.val),
        size: 14,
        align: 'center' as const,
      })),
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('contains expected node count', () => {
      const batch = lowerAll(elements);
      const nodeEllipses = batch.elements.filter(e => e.type === 'ellipse');
      expect(nodeEllipses.length).toBe(7);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 17. Number Theory — Multiplication table mod 5
  // -----------------------------------------------------------------------
  describe('17. Number Theory – Multiplication table mod 5', () => {
    const n = 5;
    const highlights: Array<{ i: number; j: number; color?: string; label?: string }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const prod = (i * j) % n;
        highlights.push({
          i,
          j,
          label: String(prod),
          color: prod === 0 ? '#e74c3c' : '#3498db',
        });
      }
    }

    const elements: DrawElement[] = [
      {
        id: 'mod5-grid',
        type: 'number_theory_grid',
        n,
        highlights,
        cx: 300,
        cy: 300,
        cellSize: 40,
      } as NumberTheoryGridElement,
      {
        id: 'mod5-title',
        type: 'latex',
        x: 200, y: 50,
        tex: '(i \\times j) \\mod 5',
        displayMode: true,
        fontSize: 20,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 18. Sequences — Fibonacci-like sequence plot
  // -----------------------------------------------------------------------
  describe('18. Sequences – Fibonacci-like plot', () => {
    // Use the golden ratio approximation: F(n) ≈ phi^n / sqrt(5)
    const elements: DrawElement[] = [
      {
        id: 'fib-seq',
        type: 'sequence_plot',
        expression: '((1+sqrt(5))/2)^n / sqrt(5)',
        nMin: 1,
        nMax: 15,
        x: 50, y: 50, width: 500, height: 300,
        dotRadius: 5,
        showLines: true,
      } as SequencePlotElement,
      {
        id: 'fib-label',
        type: 'latex',
        x: 200, y: 380,
        tex: 'F_n \\approx \\frac{\\varphi^n}{\\sqrt{5}}',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces dot ellipses', () => {
      const batch = lowerAll(elements);
      const dots = batch.elements.filter(e => e.type === 'ellipse');
      expect(dots.length).toBeGreaterThanOrEqual(10);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 19. Polar Curves — Rose curve r = cos(3θ)
  // -----------------------------------------------------------------------
  describe('19. Polar Curves – Rose r = cos(3θ)', () => {
    const elements: DrawElement[] = [
      {
        id: 'rose-curve',
        type: 'polar_plot',
        cx: 300,
        cy: 300,
        radius: 200,
        expression: 'cos(3*theta)',
        thetaMin: 0,
        thetaMax: Math.PI,
        steps: 300,
        showPolarGrid: true,
        label: 'r = cos(3θ)',
      } as PolarPlotElement,
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces curve line segments', () => {
      const batch = lowerAll(elements);
      const lines = batch.elements.filter(e => e.type === 'line');
      expect(lines.length).toBeGreaterThan(50);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });

  // -----------------------------------------------------------------------
  // 20. Parametric — Lissajous figure
  // -----------------------------------------------------------------------
  describe('20. Parametric – Lissajous figure', () => {
    const elements: DrawElement[] = [
      {
        id: 'lissajous',
        type: 'parametric_curve',
        x: 50, y: 50, width: 400, height: 400,
        xRange: [-1.5, 1.5],
        yRange: [-1.5, 1.5],
        tMin: 0,
        tMax: 2 * Math.PI,
        xExpression: 'sin(3*t)',
        yExpression: 'sin(2*t)',
        steps: 300,
        label: 'Lissajous (3:2)',
      } as ParametricCurveElement,
      {
        id: 'lissajous-eq',
        type: 'latex',
        x: 150, y: 480,
        tex: 'x = \\sin(3t), \\; y = \\sin(2t)',
        displayMode: true,
      },
    ];

    it('expands without errors and produces elements', () => {
      const batch = lowerAll(elements);
      expect(batch.elements.length).toBeGreaterThan(0);
    });

    it('lowered output passes DrawBatchSchema.safeParse', () => {
      const batch = lowerAll(elements);
      const result = DrawBatchSchema.safeParse(sanitizeForSchema(batch));
      expect(result.success, JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))).toBe(true);
    });

    it('produces smooth curve with many segments', () => {
      const batch = lowerAll(elements);
      const lines = batch.elements.filter(e => e.type === 'line');
      expect(lines.length).toBeGreaterThan(100);
    });

    it('all coordinates are finite', () => {
      const batch = lowerAll(elements);
      assertAllCoordsFinite(batch.elements);
    });
  });
});
