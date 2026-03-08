/**
 * Demo DrawBatch payloads covering 10 real-world mathematical diagrams.
 * Each payload is a complete, valid DrawBatch ready for injection.
 */
import type { DrawBatch, DrawElement } from '@/types/agent';

export interface LabeledDemo {
  label: string;
  description: string;
  payload: DrawBatch;
  expectedElementCount: number;
  expectedTypes: DrawElement['type'][];
}

// ---------------------------------------------------------------------------
// 1. Pythagorean Theorem
// ---------------------------------------------------------------------------
const pythagoreanTheorem: LabeledDemo = {
  label: 'Pythagorean Theorem',
  description: 'Right triangle with labels a, b, c and the equation a²+b²=c²',
  expectedElementCount: 8,
  expectedTypes: ['line', 'text', 'latex', 'angle_arc'],
  payload: {
    batch_id: 'demo-pythagorean',
    style_preset: 'blueprint_neat',
    elements: [
      // Right triangle sides
      { id: 'pt-base', type: 'line', from: { x: 300, y: 500 }, to: { x: 600, y: 500 }, color: '#222', stroke_width: 2 },
      { id: 'pt-height', type: 'line', from: { x: 600, y: 500 }, to: { x: 600, y: 250 }, color: '#222', stroke_width: 2 },
      { id: 'pt-hyp', type: 'line', from: { x: 300, y: 500 }, to: { x: 600, y: 250 }, color: '#222', stroke_width: 2 },
      // Right-angle marker
      { id: 'pt-right', type: 'angle_arc', x: 600, y: 500, radius: 20, startAngle: 90, endAngle: 180 },
      // Side labels
      { id: 'pt-lbl-a', type: 'text', x: 450, y: 530, text: 'a', size: 20, color: '#1e40af' },
      { id: 'pt-lbl-b', type: 'text', x: 620, y: 375, text: 'b', size: 20, color: '#1e40af' },
      { id: 'pt-lbl-c', type: 'text', x: 420, y: 360, text: 'c', size: 20, color: '#1e40af' },
      // Equation
      { id: 'pt-eq', type: 'latex', x: 400, y: 580, tex: 'a^2 + b^2 = c^2', fontSize: 24, color: '#222' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. Derivative Concept — f(x) = x² with tangent at x=2
// ---------------------------------------------------------------------------
const derivativeConcept: LabeledDemo = {
  label: 'Derivative Concept',
  description: 'f(x)=x² curve with tangent line at x=2, labeled f\'(2)=4',
  expectedElementCount: 6,
  expectedTypes: ['cartesian_axes', 'function_curve', 'line', 'text', 'latex'],
  payload: {
    batch_id: 'demo-derivative',
    style_preset: 'blueprint_neat',
    elements: [
      // Axes
      {
        id: 'dc-axes', type: 'cartesian_axes',
        x: 150, y: 50, width: 500, height: 400,
        xRange: [-1, 4], yRange: [-1, 10],
        xLabel: 'x', yLabel: 'y', gridlines: true, color: '#666',
      },
      // Parabola f(x)=x²
      {
        id: 'dc-curve', type: 'function_curve' as const,
        x: 150, y: 50, width: 500, height: 400,
        xRange: [-1, 4], yRange: [-1, 10],
        expression: 'x*x',
        points: Array.from({ length: 51 }, (_, i) => {
          const xv = -1 + i * 0.1;
          return { x: xv, y: xv * xv };
        }),
        label: 'f(x) = x²',
        color: '#222',
      },
      // Tangent line at x=2: y = 4x - 4 (slope=4, passes through (2,4))
      {
        id: 'dc-tangent', type: 'line',
        from: { x: 250, y: 350 }, to: { x: 550, y: 50 },
        color: '#dc2626', stroke_width: 2,
      },
      // Point at (2, 4)
      { id: 'dc-dot-label', type: 'text', x: 370, y: 215, text: '(2, 4)', size: 14, color: '#1e40af' },
      // Slope label
      { id: 'dc-slope', type: 'latex', x: 550, y: 100, tex: "f'(2) = 4", fontSize: 18, color: '#1e40af' },
      // Title
      { id: 'dc-title', type: 'text', x: 300, y: 480, text: 'Derivative as Tangent Slope', size: 18, color: '#222' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 3. Vector Addition — parallelogram method
// ---------------------------------------------------------------------------
const vectorAddition: LabeledDemo = {
  label: 'Vector Addition',
  description: 'Two vectors A and B with their sum A+B shown via parallelogram',
  expectedElementCount: 8,
  expectedTypes: ['vector_arrow', 'line', 'latex'],
  payload: {
    batch_id: 'demo-vector-add',
    style_preset: 'blueprint_neat',
    elements: [
      // Vector A from origin
      { id: 'va-a', type: 'vector_arrow', x: 300, y: 400, dx: 200, dy: -100, label: 'A', color: '#222' },
      // Vector B from origin
      { id: 'va-b', type: 'vector_arrow', x: 300, y: 400, dx: 80, dy: -200, label: 'B', color: '#1e40af' },
      // Resultant A+B
      { id: 'va-sum', type: 'vector_arrow', x: 300, y: 400, dx: 280, dy: -300, label: 'A+B', color: '#dc2626', stroke_width: 3 },
      // Parallelogram dashed sides
      { id: 'va-dash1', type: 'line', from: { x: 500, y: 300 }, to: { x: 580, y: 100 }, color: '#999', stroke_width: 1 },
      { id: 'va-dash2', type: 'line', from: { x: 380, y: 200 }, to: { x: 580, y: 100 }, color: '#999', stroke_width: 1 },
      // Labels
      { id: 'va-eq', type: 'latex', x: 350, y: 450, tex: '\\vec{A} + \\vec{B} = \\vec{C}', fontSize: 20, color: '#222' },
      { id: 'va-mag-a', type: 'latex', x: 200, y: 500, tex: '|\\vec{A}| = \\sqrt{200^2+100^2}', fontSize: 14, color: '#666' },
      { id: 'va-mag-b', type: 'latex', x: 500, y: 500, tex: '|\\vec{B}| = \\sqrt{80^2+200^2}', fontSize: 14, color: '#666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 4. Unit Circle
// ---------------------------------------------------------------------------
const unitCircle: LabeledDemo = {
  label: 'Unit Circle',
  description: 'Circle of radius 1 with 30°, 45°, 60°, 90° angles marked',
  expectedElementCount: 13,
  expectedTypes: ['cartesian_axes', 'ellipse', 'line', 'angle_arc', 'text'],
  payload: {
    batch_id: 'demo-unit-circle',
    style_preset: 'blueprint_neat',
    elements: [
      // Axes
      {
        id: 'uc-axes', type: 'cartesian_axes',
        x: 250, y: 50, width: 400, height: 400,
        xRange: [-1.5, 1.5], yRange: [-1.5, 1.5],
        xLabel: 'x', yLabel: 'y', gridlines: false, color: '#666',
      },
      // Unit circle
      { id: 'uc-circle', type: 'ellipse', cx: 450, cy: 250, rx: 130, ry: 130, color: '#222', stroke_width: 2 },
      // Radii for 30°, 45°, 60°, 90°
      { id: 'uc-r30', type: 'line', from: { x: 450, y: 250 }, to: { x: 563, y: 185 }, color: '#1e40af' },
      { id: 'uc-r45', type: 'line', from: { x: 450, y: 250 }, to: { x: 542, y: 158 }, color: '#1e40af' },
      { id: 'uc-r60', type: 'line', from: { x: 450, y: 250 }, to: { x: 515, y: 137 }, color: '#1e40af' },
      { id: 'uc-r90', type: 'line', from: { x: 450, y: 250 }, to: { x: 450, y: 120 }, color: '#1e40af' },
      // Angle arcs
      { id: 'uc-arc30', type: 'angle_arc', x: 450, y: 250, radius: 30, startAngle: 0, endAngle: 30, label: '30°' },
      { id: 'uc-arc45', type: 'angle_arc', x: 450, y: 250, radius: 40, startAngle: 0, endAngle: 45, label: '45°' },
      { id: 'uc-arc60', type: 'angle_arc', x: 450, y: 250, radius: 50, startAngle: 0, endAngle: 60, label: '60°' },
      { id: 'uc-arc90', type: 'angle_arc', x: 450, y: 250, radius: 60, startAngle: 0, endAngle: 90, label: '90°' },
      // Coordinate labels at key points
      { id: 'uc-lbl30', type: 'text', x: 570, y: 175, text: '(√3/2, 1/2)', size: 12, color: '#666' },
      { id: 'uc-lbl45', type: 'text', x: 548, y: 145, text: '(√2/2, √2/2)', size: 12, color: '#666' },
      { id: 'uc-lbl90', type: 'text', x: 458, y: 108, text: '(0, 1)', size: 12, color: '#666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 5. Gaussian / Normal Distribution
// ---------------------------------------------------------------------------
function gaussianPoints(mu: number, sigma: number, count: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const lo = mu - 4 * sigma;
  const hi = mu + 4 * sigma;
  for (let i = 0; i <= count; i++) {
    const xv = lo + (hi - lo) * (i / count);
    const yv = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((xv - mu) / sigma) ** 2);
    pts.push({ x: xv, y: yv });
  }
  return pts;
}

const gaussianDistribution: LabeledDemo = {
  label: 'Gaussian Distribution',
  description: 'Bell curve using function_curve with μ=0, σ=1',
  expectedElementCount: 6,
  expectedTypes: ['cartesian_axes', 'function_curve', 'latex', 'line'],
  payload: {
    batch_id: 'demo-gaussian',
    style_preset: 'blueprint_neat',
    elements: [
      // Axes
      {
        id: 'gd-axes', type: 'cartesian_axes',
        x: 100, y: 50, width: 600, height: 350,
        xRange: [-4, 4], yRange: [0, 0.45],
        xLabel: 'x', yLabel: 'f(x)', gridlines: true, color: '#666',
      },
      // Bell curve
      {
        id: 'gd-bell', type: 'function_curve' as const,
        x: 100, y: 50, width: 600, height: 350,
        xRange: [-4, 4], yRange: [0, 0.45],
        points: gaussianPoints(0, 1, 80),
        label: 'N(0, 1)',
        color: '#222', stroke_width: 2,
      },
      // Vertical mean line
      { id: 'gd-mean', type: 'line', from: { x: 400, y: 50 }, to: { x: 400, y: 400 }, color: '#dc2626', stroke_width: 1 },
      // ±1σ markers
      { id: 'gd-sig1', type: 'line', from: { x: 475, y: 50 }, to: { x: 475, y: 400 }, color: '#999', stroke_width: 1 },
      { id: 'gd-sig-1', type: 'line', from: { x: 325, y: 50 }, to: { x: 325, y: 400 }, color: '#999', stroke_width: 1 },
      // Formula
      { id: 'gd-formula', type: 'latex', x: 250, y: 430, tex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}', fontSize: 18, color: '#222' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 6. Matrix Multiplication
// ---------------------------------------------------------------------------
const matrixMultiplication: LabeledDemo = {
  label: 'Matrix Multiplication',
  description: '2×2 matrix bracket showing [a b; c d] × [e f; g h]',
  expectedElementCount: 5,
  expectedTypes: ['matrix_bracket', 'latex', 'text'],
  payload: {
    batch_id: 'demo-matrix-mult',
    style_preset: 'blueprint_neat',
    elements: [
      // First matrix
      {
        id: 'mm-a', type: 'matrix_bracket',
        x: 200, y: 200, rows: [['a', 'b'], ['c', 'd']],
        bracketStyle: '[]', cellWidth: 40, cellHeight: 40, color: '#222',
      },
      // Multiplication sign
      { id: 'mm-times', type: 'latex', x: 310, y: 230, tex: '\\times', fontSize: 28, color: '#222' },
      // Second matrix
      {
        id: 'mm-b', type: 'matrix_bracket',
        x: 360, y: 200, rows: [['e', 'f'], ['g', 'h']],
        bracketStyle: '[]', cellWidth: 40, cellHeight: 40, color: '#222',
      },
      // Equals sign
      { id: 'mm-eq', type: 'text', x: 470, y: 230, text: '=', size: 28, color: '#222' },
      // Result matrix
      {
        id: 'mm-result', type: 'matrix_bracket',
        x: 510, y: 200,
        rows: [['ae+bg', 'af+bh'], ['ce+dg', 'cf+dh']],
        bracketStyle: '[]', cellWidth: 70, cellHeight: 40, color: '#1e40af',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 7. Integration Area — ∫₀² x² dx
// ---------------------------------------------------------------------------
function integralTopPoints(count: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i++) {
    const xv = (2 * i) / count; // 0 to 2
    pts.push({ x: xv, y: xv * xv }); // y = x²
  }
  return pts;
}

const integrationArea: LabeledDemo = {
  label: 'Integration Area',
  description: 'integral_region showing ∫₀² x² dx with shaded area',
  expectedElementCount: 5,
  expectedTypes: ['cartesian_axes', 'integral_region', 'latex', 'text'],
  payload: {
    batch_id: 'demo-integration',
    style_preset: 'blueprint_neat',
    elements: [
      // Axes
      {
        id: 'ia-axes', type: 'cartesian_axes',
        x: 150, y: 50, width: 500, height: 400,
        xRange: [-0.5, 3], yRange: [-0.5, 5],
        xLabel: 'x', yLabel: 'y', gridlines: true, color: '#666',
      },
      // Shaded integral region
      {
        id: 'ia-region', type: 'integral_region',
        x: 150, y: 50, width: 500, height: 400,
        xRange: [0, 2], yRange: [0, 4],
        topPoints: integralTopPoints(40),
        fillColor: 'rgba(30, 64, 175, 0.2)',
        strokeColor: '#1e40af',
        label: '∫₀² x² dx',
      },
      // Integral equation
      { id: 'ia-eq', type: 'latex', x: 400, y: 480, tex: '\\int_0^2 x^2\\,dx = \\frac{8}{3}', fontSize: 22, color: '#222' },
      // Boundary labels
      { id: 'ia-lbl-a', type: 'text', x: 220, y: 465, text: '0', size: 14, color: '#666' },
      { id: 'ia-lbl-b', type: 'text', x: 435, y: 465, text: '2', size: 14, color: '#666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 8. Coordinate Geometry — distance between two points
// ---------------------------------------------------------------------------
const coordinateGeometry: LabeledDemo = {
  label: 'Coordinate Geometry',
  description: 'Two points P1(1,2) and P2(4,6) with distance formula',
  expectedElementCount: 9,
  expectedTypes: ['cartesian_axes', 'ellipse', 'line', 'text', 'latex'],
  payload: {
    batch_id: 'demo-coord-geom',
    style_preset: 'blueprint_neat',
    elements: [
      // Axes
      {
        id: 'cg-axes', type: 'cartesian_axes',
        x: 150, y: 50, width: 400, height: 400,
        xRange: [-1, 6], yRange: [-1, 8],
        xLabel: 'x', yLabel: 'y', gridlines: true, color: '#666',
      },
      // Point P1
      { id: 'cg-p1', type: 'ellipse', cx: 207, cy: 350, rx: 5, ry: 5, color: '#dc2626' },
      // Point P2
      { id: 'cg-p2', type: 'ellipse', cx: 378, cy: 150, rx: 5, ry: 5, color: '#dc2626' },
      // Line segment P1-P2
      { id: 'cg-seg', type: 'line', from: { x: 207, y: 350 }, to: { x: 378, y: 150 }, color: '#222', stroke_width: 2 },
      // Horizontal leg (Δx)
      { id: 'cg-dx', type: 'line', from: { x: 207, y: 350 }, to: { x: 378, y: 350 }, color: '#999', stroke_width: 1 },
      // Vertical leg (Δy)
      { id: 'cg-dy', type: 'line', from: { x: 378, y: 350 }, to: { x: 378, y: 150 }, color: '#999', stroke_width: 1 },
      // Labels
      { id: 'cg-lbl-p1', type: 'text', x: 165, y: 365, text: 'P₁(1,2)', size: 14, color: '#1e40af' },
      { id: 'cg-lbl-p2', type: 'text', x: 388, y: 140, text: 'P₂(4,6)', size: 14, color: '#1e40af' },
      // Distance formula
      { id: 'cg-formula', type: 'latex', x: 200, y: 480, tex: 'd = \\sqrt{(4-1)^2 + (6-2)^2} = 5', fontSize: 20, color: '#222' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 9. Complex Number Plane (Argand Diagram)
// ---------------------------------------------------------------------------
const complexPlane: LabeledDemo = {
  label: 'Complex Number Plane',
  description: 'Argand diagram showing z = a + bi',
  expectedElementCount: 9,
  expectedTypes: ['cartesian_axes', 'vector_arrow', 'line', 'angle_arc', 'text', 'latex'],
  payload: {
    batch_id: 'demo-complex-plane',
    style_preset: 'blueprint_neat',
    elements: [
      // Axes — Re and Im
      {
        id: 'cp-axes', type: 'cartesian_axes',
        x: 200, y: 50, width: 400, height: 400,
        xRange: [-3, 5], yRange: [-2, 5],
        xLabel: 'Re', yLabel: 'Im', gridlines: true, color: '#666',
      },
      // Vector z = 3 + 2i
      { id: 'cp-vec', type: 'vector_arrow', x: 400, y: 300, dx: 150, dy: -120, label: 'z', color: '#222', stroke_width: 2 },
      // Horizontal projection (Re)
      { id: 'cp-re-proj', type: 'line', from: { x: 550, y: 180 }, to: { x: 550, y: 300 }, color: '#999', stroke_width: 1 },
      // Vertical projection (Im)
      { id: 'cp-im-proj', type: 'line', from: { x: 400, y: 300 }, to: { x: 550, y: 300 }, color: '#999', stroke_width: 1 },
      // Angle θ
      { id: 'cp-angle', type: 'angle_arc', x: 400, y: 300, radius: 35, startAngle: 0, endAngle: 34, label: 'θ' },
      // Labels
      { id: 'cp-lbl-re', type: 'text', x: 480, y: 315, text: 'a = 3', size: 14, color: '#1e40af' },
      { id: 'cp-lbl-im', type: 'text', x: 560, y: 240, text: 'b = 2', size: 14, color: '#1e40af' },
      // z notation
      { id: 'cp-eq', type: 'latex', x: 250, y: 480, tex: 'z = a + bi = 3 + 2i', fontSize: 18, color: '#222' },
      // Modulus
      { id: 'cp-mod', type: 'latex', x: 500, y: 480, tex: '|z| = \\sqrt{a^2 + b^2} = \\sqrt{13}', fontSize: 16, color: '#666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 10. Taylor Series — e^x approximation
// ---------------------------------------------------------------------------
function expPoints(count: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i++) {
    const xv = -2 + (4 * i) / count;
    pts.push({ x: xv, y: Math.exp(xv) });
  }
  return pts;
}

function taylorExpPoints(order: number, count: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i++) {
    const xv = -2 + (4 * i) / count;
    let yv = 0;
    let factorial = 1;
    for (let n = 0; n <= order; n++) {
      if (n > 0) factorial *= n;
      yv += Math.pow(xv, n) / factorial;
    }
    pts.push({ x: xv, y: yv });
  }
  return pts;
}

const taylorSeries: LabeledDemo = {
  label: 'Taylor Series',
  description: 'e^x ≈ 1 + x + x²/2! + ... with partial sums',
  expectedElementCount: 7,
  expectedTypes: ['cartesian_axes', 'function_curve', 'latex'],
  payload: {
    batch_id: 'demo-taylor',
    style_preset: 'blueprint_neat',
    elements: [
      // Axes
      {
        id: 'ts-axes', type: 'cartesian_axes',
        x: 100, y: 30, width: 600, height: 400,
        xRange: [-2, 2], yRange: [-1, 8],
        xLabel: 'x', yLabel: 'y', gridlines: true, color: '#666',
      },
      // Exact e^x
      {
        id: 'ts-exact', type: 'function_curve' as const,
        x: 100, y: 30, width: 600, height: 400,
        xRange: [-2, 2], yRange: [-1, 8],
        points: expPoints(60),
        label: 'eˣ',
        color: '#222', stroke_width: 2,
      },
      // 1st order: 1 + x
      {
        id: 'ts-t1', type: 'function_curve' as const,
        x: 100, y: 30, width: 600, height: 400,
        xRange: [-2, 2], yRange: [-1, 8],
        points: taylorExpPoints(1, 60),
        label: '1 + x',
        color: '#dc2626', stroke_width: 1,
      },
      // 2nd order: 1 + x + x²/2
      {
        id: 'ts-t2', type: 'function_curve' as const,
        x: 100, y: 30, width: 600, height: 400,
        xRange: [-2, 2], yRange: [-1, 8],
        points: taylorExpPoints(2, 60),
        label: '1 + x + x²/2',
        color: '#2563eb', stroke_width: 1,
      },
      // 4th order
      {
        id: 'ts-t4', type: 'function_curve' as const,
        x: 100, y: 30, width: 600, height: 400,
        xRange: [-2, 2], yRange: [-1, 8],
        points: taylorExpPoints(4, 60),
        label: 'T₄(x)',
        color: '#059669', stroke_width: 1,
      },
      // Taylor formula
      { id: 'ts-formula', type: 'latex', x: 150, y: 460, tex: 'e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!} = 1 + x + \\frac{x^2}{2!} + \\frac{x^3}{3!} + \\cdots', fontSize: 18, color: '#222' },
      // Convergence note
      { id: 'ts-note', type: 'latex', x: 300, y: 510, tex: '\\text{Converges for all } x \\in \\mathbb{R}', fontSize: 14, color: '#666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Export all demos
// ---------------------------------------------------------------------------
export const demoPayloads: LabeledDemo[] = [
  pythagoreanTheorem,
  derivativeConcept,
  vectorAddition,
  unitCircle,
  gaussianDistribution,
  matrixMultiplication,
  integrationArea,
  coordinateGeometry,
  complexPlane,
  taylorSeries,
];
