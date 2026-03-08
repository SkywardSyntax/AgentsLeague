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
// 11. Calculus: FTC Demo — Fundamental Theorem of Calculus
// ---------------------------------------------------------------------------
function sinPlusOnePoints(xMin: number, xMax: number, count: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i++) {
    const xv = xMin + ((xMax - xMin) * i) / count;
    pts.push({ x: xv, y: Math.sin(xv) + 1 });
  }
  return pts;
}

const ftcDemo: LabeledDemo = {
  label: 'Calculus: FTC Demo',
  description: 'Fundamental Theorem of Calculus with integral region and Riemann sums',
  expectedElementCount: 6,
  expectedTypes: ['cartesian_axes', 'function_curve', 'integral_region', 'riemann_sum', 'text'],
  payload: {
    batch_id: 'demo-ftc',
    style_preset: 'mathematical',
    elements: [
      {
        id: 'ftc-axes', type: 'cartesian_axes',
        x: 80, y: 50, width: 700, height: 500,
        xRange: [-0.5, 4.5], yRange: [-0.5, 3],
        xLabel: 'x', yLabel: 'y', gridlines: true,
      },
      {
        id: 'ftc-curve', type: 'function_curve' as DrawElement['type'],
        x: 80, y: 50, width: 700, height: 500,
        xRange: [-0.5, 4.5], yRange: [-0.5, 3],
        points: sinPlusOnePoints(-0.5, 4.5, 80),
        label: 'f(x) = sin(x) + 1',
        color: '#0a84ff', stroke_width: 2,
      } as DrawElement,
      {
        id: 'ftc-region', type: 'integral_region',
        x: 80, y: 50, width: 700, height: 500,
        xRange: [1, 3], yRange: [-0.5, 3],
        topPoints: sinPlusOnePoints(1, 3, 40),
        fillColor: 'rgba(30, 64, 175, 0.2)', strokeColor: '#1e40af',
        label: '∫₁³ f(x)dx',
      },
      {
        id: 'ftc-riemann', type: 'riemann_sum' as DrawElement['type'],
        x: 80, y: 50, width: 700, height: 500,
        xRange: [1, 3], yRange: [-0.5, 3],
        expression: 'Math.sin(x) + 1', n: 8, method: 'left',
        showFunction: false, showAxes: false,
      } as DrawElement,
      { id: 'ftc-lbl1', type: 'text', x: 820, y: 120, text: 'Area = ∫f(x)dx', size: 16, color: '#1e40af' },
      { id: 'ftc-lbl2', type: 'text', x: 820, y: 160, text: 'Left Riemann Sum', size: 14, color: '#666666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 12. Linear Algebra: 2D Rotation
// ---------------------------------------------------------------------------
const rotation2D: LabeledDemo = {
  label: 'Linear Algebra: 2D Rotation',
  description: '45° rotation matrix with transformed basis vectors',
  expectedElementCount: 8,
  expectedTypes: ['linear_transform', 'vector_arrow', 'text', 'matrix_bracket', 'latex'],
  payload: {
    batch_id: 'demo-rotation-2d',
    style_preset: 'blueprint_neat',
    elements: [
      {
        id: 'rot-tf', type: 'linear_transform',
        x: 80, y: 60, width: 500, height: 500,
        matrix: [[0.707, -0.707], [0.707, 0.707]],
        showBasisVectors: true, showOriginalGrid: true, gridRange: 3,
        label: 'Rotation by 45°',
      },
      { id: 'rot-e1', type: 'vector_arrow', x: 330, y: 310, dx: 140, dy: 0, label: 'e₁', color: '#2563eb', stroke_width: 2 },
      { id: 'rot-e2', type: 'vector_arrow', x: 330, y: 310, dx: 0, dy: -140, label: 'e₂', color: '#059669', stroke_width: 2 },
      { id: 'rot-title', type: 'text', x: 80, y: 30, text: 'Rotation by 45°', size: 18, color: '#1e40af' },
      { id: 'rot-te1', type: 'text', x: 620, y: 150, text: 'T(e₁) = (cos45°, sin45°)', size: 14, color: '#2563eb' },
      { id: 'rot-te2', type: 'text', x: 620, y: 190, text: 'T(e₂) = (-sin45°, cos45°)', size: 14, color: '#059669' },
      {
        id: 'rot-mat', type: 'matrix_bracket',
        x: 620, y: 260, rows: [['0.707', '-0.707'], ['0.707', '0.707']],
        bracketStyle: '[]', cellWidth: 55, cellHeight: 32,
      },
      { id: 'rot-mlbl', type: 'latex', x: 620, y: 230, tex: 'R_{45°} =', fontSize: 18, displayMode: false },
    ],
  },
};

// ---------------------------------------------------------------------------
// 13. Statistics: Normal Distribution with Histogram
// ---------------------------------------------------------------------------
const normalDistribution: LabeledDemo = {
  label: 'Statistics: Normal Distribution',
  description: 'Bell curve overlaid on histogram bins',
  expectedElementCount: 6,
  expectedTypes: ['histogram', 'normal_distribution', 'text', 'latex'],
  payload: {
    batch_id: 'demo-normal-dist',
    style_preset: 'mathematical',
    elements: [
      {
        id: 'nd-hist', type: 'histogram',
        x: 100, y: 80, width: 600, height: 400,
        bins: [
          { label: '-2.5', value: 2 }, { label: '-2', value: 5 },
          { label: '-1.5', value: 12 }, { label: '-1', value: 22 },
          { label: '-0.5', value: 30 }, { label: '0', value: 34 },
          { label: '0.5', value: 28 }, { label: '1', value: 18 },
          { label: '1.5', value: 8 }, { label: '2', value: 3 },
        ],
        showValues: true, showAxes: true,
        xLabel: 'Value', yLabel: 'Frequency',
      },
      {
        id: 'nd-curve', type: 'normal_distribution',
        x: 100, y: 80, width: 600, height: 400,
        mu: 0, sigma: 1,
        showMeanLine: true, showSigmaLines: true, showLabels: true,
      },
      { id: 'nd-title', type: 'text', x: 280, y: 30, text: 'Normal Distribution', size: 20, color: '#1e40af' },
      { id: 'nd-mu', type: 'latex', x: 750, y: 150, tex: '\\mu = 0', fontSize: 18, displayMode: false },
      { id: 'nd-sigma', type: 'latex', x: 750, y: 200, tex: '\\sigma = 1', fontSize: 18, displayMode: false },
      { id: 'nd-formula', type: 'latex', x: 750, y: 280, tex: 'f(x) = \\frac{1}{\\sqrt{2\\pi}} e^{-x^2/2}', fontSize: 14, displayMode: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// 14. Calculus: Derivative at Point
// ---------------------------------------------------------------------------
function parabolaPoints(count: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i++) {
    const xv = -2 + (6 * i) / count;
    pts.push({ x: xv, y: xv * xv - 2 * xv + 2 });
  }
  return pts;
}

const derivativeAtPoint: LabeledDemo = {
  label: 'Calculus: Derivative at Point',
  description: 'f(x)=x²−2x+2 with tangent line at x=2',
  expectedElementCount: 7,
  expectedTypes: ['cartesian_axes', 'function_curve', 'tangent_line', 'latex', 'text'],
  payload: {
    batch_id: 'demo-deriv-point',
    style_preset: 'mathematical',
    elements: [
      {
        id: 'dp-axes', type: 'cartesian_axes',
        x: 100, y: 50, width: 600, height: 450,
        xRange: [-2, 4], yRange: [-1, 5],
        xLabel: 'x', yLabel: 'y', gridlines: true,
      },
      {
        id: 'dp-curve', type: 'function_curve' as DrawElement['type'],
        x: 100, y: 50, width: 600, height: 450,
        xRange: [-2, 4], yRange: [-1, 5],
        points: parabolaPoints(60),
        label: 'f(x) = x² − 2x + 2',
        color: '#0a84ff', stroke_width: 2,
      } as DrawElement,
      {
        id: 'dp-tan', type: 'tangent_line' as DrawElement['type'],
        x: 100, y: 50, width: 600, height: 450,
        xRange: [-2, 4], yRange: [-1, 5],
        expression: 'x*x - 2*x + 2', atX: 2,
        length: 2.5, showPoint: true,
        label: "f'(2) = 2", color: '#dc2626',
      } as DrawElement,
      { id: 'dp-flbl', type: 'latex', x: 740, y: 100, tex: 'f(x) = x^2 - 2x + 2', fontSize: 18, displayMode: false },
      { id: 'dp-dlbl', type: 'latex', x: 740, y: 160, tex: "f'(x) = 2x - 2", fontSize: 16, displayMode: false },
      { id: 'dp-val', type: 'latex', x: 740, y: 220, tex: "f'(2) = 2", fontSize: 16, displayMode: false, color: '#dc2626' },
      { id: 'dp-pt', type: 'text', x: 740, y: 280, text: 'Point: (2, 2)', size: 14, color: '#666666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 15. Parametric: Lissajous Figure
// ---------------------------------------------------------------------------
const lissajousFigure: LabeledDemo = {
  label: 'Parametric: Lissajous Figure',
  description: 'Parametric curve x=sin(3t), y=sin(2t)',
  expectedElementCount: 5,
  expectedTypes: ['parametric_curve', 'text', 'latex'],
  payload: {
    batch_id: 'demo-lissajous',
    style_preset: 'mathematical',
    elements: [
      {
        id: 'lj-curve', type: 'parametric_curve' as DrawElement['type'],
        x: 150, y: 50, width: 500, height: 500,
        xRange: [-1.3, 1.3], yRange: [-1.3, 1.3],
        tMin: 0, tMax: 2 * Math.PI,
        xExpression: 'Math.sin(3*t)', yExpression: 'Math.sin(2*t)',
        steps: 300, label: 'Lissajous 3:2',
        color: '#7c3aed', stroke_width: 2,
      } as DrawElement,
      { id: 'lj-title', type: 'text', x: 280, y: 20, text: 'Lissajous Figure', size: 20, color: '#1e40af' },
      { id: 'lj-eq1', type: 'latex', x: 700, y: 150, tex: 'x(t) = \\sin(3t)', fontSize: 18, displayMode: false },
      { id: 'lj-eq2', type: 'latex', x: 700, y: 210, tex: 'y(t) = \\sin(2t)', fontSize: 18, displayMode: false },
      { id: 'lj-range', type: 'latex', x: 700, y: 280, tex: 't \\in [0, 2\\pi]', fontSize: 16, displayMode: false, color: '#666666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 16. Polar: Rose Curve
// ---------------------------------------------------------------------------
const roseCurve: LabeledDemo = {
  label: 'Polar: Rose Curve',
  description: 'Polar plot r = cos(3θ)',
  expectedElementCount: 5,
  expectedTypes: ['polar_plot', 'text', 'latex'],
  payload: {
    batch_id: 'demo-rose-curve',
    style_preset: 'mathematical',
    elements: [
      {
        id: 'rc-plot', type: 'polar_plot' as DrawElement['type'],
        cx: 400, cy: 320, radius: 220,
        expression: 'Math.cos(3*theta)',
        thetaMin: 0, thetaMax: Math.PI,
        steps: 300, showPolarGrid: true,
        label: 'r = cos(3θ)',
        color: '#e11d48', stroke_width: 2,
      } as DrawElement,
      { id: 'rc-title', type: 'text', x: 300, y: 30, text: 'Rose Curve (3 petals)', size: 20, color: '#1e40af' },
      { id: 'rc-eq', type: 'latex', x: 680, y: 150, tex: 'r = \\cos(3\\theta)', fontSize: 22, displayMode: false },
      { id: 'rc-range', type: 'latex', x: 680, y: 220, tex: '\\theta \\in [0, \\pi]', fontSize: 16, displayMode: false, color: '#666666' },
      { id: 'rc-note', type: 'text', x: 680, y: 290, text: 'k=3 → 3 petals', size: 14, color: '#666666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 17. Matrix Operations — A × B = C
// ---------------------------------------------------------------------------
const matrixOperations: LabeledDemo = {
  label: 'Matrix Operations',
  description: '2×2 matrix multiplication A × B = C',
  expectedElementCount: 12,
  expectedTypes: ['matrix_bracket', 'arrow', 'text', 'latex'],
  payload: {
    batch_id: 'demo-matrix-ops',
    style_preset: 'blueprint_neat',
    elements: [
      { id: 'mo-title', type: 'text', x: 300, y: 50, text: 'Matrix Multiplication', size: 20, color: '#1e40af' },
      { id: 'mo-albl', type: 'latex', x: 120, y: 120, tex: 'A =', fontSize: 18, displayMode: false },
      {
        id: 'mo-a', type: 'matrix_bracket',
        x: 170, y: 130, rows: [['2', '1'], ['0', '3']],
        bracketStyle: '[]', cellWidth: 40, cellHeight: 36,
      },
      {
        id: 'mo-times', type: 'arrow',
        from: { x: 280, y: 165 }, to: { x: 320, y: 165 },
        label: '×', color: '#111827', stroke_width: 2,
      },
      { id: 'mo-blbl', type: 'latex', x: 340, y: 120, tex: 'B =', fontSize: 18, displayMode: false },
      {
        id: 'mo-b', type: 'matrix_bracket',
        x: 390, y: 130, rows: [['4', '-1'], ['2', '5']],
        bracketStyle: '[]', cellWidth: 40, cellHeight: 36,
      },
      { id: 'mo-eq', type: 'text', x: 510, y: 155, text: '=', size: 28 },
      { id: 'mo-clbl', type: 'latex', x: 550, y: 120, tex: 'C =', fontSize: 18, displayMode: false },
      {
        id: 'mo-c', type: 'matrix_bracket',
        x: 600, y: 130, rows: [['10', '3'], ['6', '15']],
        bracketStyle: '[]', cellWidth: 40, cellHeight: 36, color: '#1e40af',
      },
      { id: 'mo-formula', type: 'latex', x: 120, y: 260, tex: 'C_{ij} = \\sum_k A_{ik} B_{kj}', fontSize: 18, displayMode: true },
      { id: 'mo-ex1', type: 'latex', x: 120, y: 340, tex: 'C_{11} = 2 \\cdot 4 + 1 \\cdot 2 = 10', fontSize: 14, displayMode: false, color: '#666666' },
      { id: 'mo-ex2', type: 'latex', x: 120, y: 380, tex: 'C_{12} = 2 \\cdot (-1) + 1 \\cdot 5 = 3', fontSize: 14, displayMode: false, color: '#666666' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 18. Probability Tree — Bernoulli Process
// ---------------------------------------------------------------------------
const probabilityTree: LabeledDemo = {
  label: 'Probability Tree',
  description: 'Two-stage Bernoulli trial tree with p=0.7',
  expectedElementCount: 32,
  expectedTypes: ['ellipse', 'line', 'text'],
  payload: {
    batch_id: 'demo-prob-tree',
    style_preset: 'clean_pen_sketch',
    elements: [
      { id: 'pt-title', type: 'text', x: 350, y: 30, text: 'Bernoulli Process', size: 20, color: '#1e40af' },
      // Root node
      { id: 'pt-root', type: 'ellipse', cx: 200, cy: 250, rx: 24, ry: 24, color: '#1e40af', stroke_width: 2 },
      { id: 'pt-rlbl', type: 'text', x: 192, y: 244, text: 'Start', size: 10, color: '#1e40af' },
      // Success branch (top)
      { id: 'pt-s1', type: 'line', from: { x: 224, y: 238 }, to: { x: 396, y: 150 }, color: '#059669', stroke_width: 2 },
      { id: 'pt-s1p', type: 'text', x: 280, y: 175, text: 'p=0.7', size: 13, color: '#059669' },
      { id: 'pt-s1n', type: 'ellipse', cx: 420, cy: 140, rx: 22, ry: 22, color: '#059669', stroke_width: 2 },
      { id: 'pt-s1l', type: 'text', x: 412, y: 134, text: 'S', size: 14, color: '#059669' },
      // Failure branch (bottom)
      { id: 'pt-f1', type: 'line', from: { x: 224, y: 262 }, to: { x: 396, y: 350 }, color: '#dc2626', stroke_width: 2 },
      { id: 'pt-f1p', type: 'text', x: 280, y: 325, text: 'p=0.3', size: 13, color: '#dc2626' },
      { id: 'pt-f1n', type: 'ellipse', cx: 420, cy: 360, rx: 22, ry: 22, color: '#dc2626', stroke_width: 2 },
      { id: 'pt-f1l', type: 'text', x: 414, y: 354, text: 'F', size: 14, color: '#dc2626' },
      // Second level — from S
      { id: 'pt-ss', type: 'line', from: { x: 442, y: 130 }, to: { x: 596, y: 90 }, color: '#059669', stroke_width: 1 },
      { id: 'pt-ssp', type: 'text', x: 500, y: 92, text: '0.7', size: 11, color: '#059669' },
      { id: 'pt-ssn', type: 'ellipse', cx: 620, cy: 80, rx: 18, ry: 18, color: '#059669', stroke_width: 2 },
      { id: 'pt-ssl', type: 'text', x: 612, y: 74, text: 'SS', size: 11, color: '#059669' },
      { id: 'pt-sf', type: 'line', from: { x: 442, y: 150 }, to: { x: 596, y: 190 }, color: '#dc2626', stroke_width: 1 },
      { id: 'pt-sfp', type: 'text', x: 500, y: 185, text: '0.3', size: 11, color: '#dc2626' },
      { id: 'pt-sfn', type: 'ellipse', cx: 620, cy: 200, rx: 18, ry: 18, color: '#dc2626', stroke_width: 2 },
      { id: 'pt-sfl', type: 'text', x: 612, y: 194, text: 'SF', size: 11, color: '#b45309' },
      // Second level — from F
      { id: 'pt-fs', type: 'line', from: { x: 442, y: 350 }, to: { x: 596, y: 310 }, color: '#059669', stroke_width: 1 },
      { id: 'pt-fsp', type: 'text', x: 500, y: 312, text: '0.7', size: 11, color: '#059669' },
      { id: 'pt-fsn', type: 'ellipse', cx: 620, cy: 300, rx: 18, ry: 18, color: '#059669', stroke_width: 2 },
      { id: 'pt-fsl', type: 'text', x: 612, y: 294, text: 'FS', size: 11, color: '#b45309' },
      { id: 'pt-ff', type: 'line', from: { x: 442, y: 370 }, to: { x: 596, y: 410 }, color: '#dc2626', stroke_width: 1 },
      { id: 'pt-ffp', type: 'text', x: 500, y: 405, text: '0.3', size: 11, color: '#dc2626' },
      { id: 'pt-ffn', type: 'ellipse', cx: 620, cy: 420, rx: 18, ry: 18, color: '#dc2626', stroke_width: 2 },
      { id: 'pt-ffl', type: 'text', x: 612, y: 414, text: 'FF', size: 11, color: '#dc2626' },
      // Probabilities on right
      { id: 'pt-pss', type: 'text', x: 660, y: 74, text: 'P=0.49', size: 12, color: '#111827' },
      { id: 'pt-psf', type: 'text', x: 660, y: 194, text: 'P=0.21', size: 12, color: '#111827' },
      { id: 'pt-pfs', type: 'text', x: 660, y: 294, text: 'P=0.21', size: 12, color: '#111827' },
      { id: 'pt-pff', type: 'text', x: 660, y: 414, text: 'P=0.09', size: 12, color: '#111827' },
      { id: 'pt-sum', type: 'text', x: 660, y: 470, text: 'Σ = 1.00', size: 14, color: '#1e40af' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 19. Topology: Complex Plane — 6th roots of unity
// ---------------------------------------------------------------------------
const complexPlaneRoots: LabeledDemo = {
  label: 'Topology: Complex Plane — Roots of Unity',
  description: '6th roots of unity on the complex plane with unit circle',
  expectedElementCount: 3,
  expectedTypes: ['complex_plane', 'latex'],
  payload: {
    batch_id: 'demo-complex-plane-roots',
    style_preset: 'mathematical',
    colorTheme: 'colorful',
    elements: [
      {
        id: 'cpr-plane', type: 'complex_plane',
        points: [
          { re: 1, im: 0, label: '1', color: '#dc2626' },
          { re: 0.5, im: 0.866, label: 'ω', color: '#2563eb' },
          { re: -0.5, im: 0.866, label: 'ω²', color: '#059669' },
          { re: -1, im: 0, label: 'ω³', color: '#d97706' },
          { re: -0.5, im: -0.866, label: 'ω⁴', color: '#7c3aed' },
          { re: 0.5, im: -0.866, label: 'ω⁵', color: '#db2777' },
        ],
        showUnitCircle: true,
        xRange: [-2, 2] as [number, number],
        yRange: [-2, 2] as [number, number],
        strokeColor: '#374151',
      } as DrawElement,
      { id: 'cpr-title', type: 'latex', x: 80, y: 30, tex: '\\text{6th Roots of Unity: } z^6 = 1', fontSize: 22, color: '#111827' },
      { id: 'cpr-formula', type: 'latex', x: 80, y: 70, tex: '\\omega_k = e^{2\\pi i k / 6}, \\quad k = 0,1,\\ldots,5', fontSize: 16, color: '#374151' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 20. ODE: Direction Field — dy/dx = x − y
// ---------------------------------------------------------------------------
const odeDirectionField: LabeledDemo = {
  label: 'ODE: Direction Field',
  description: 'Slope field for dy/dx = x − y with solution curve from (0, 2)',
  expectedElementCount: 5,
  expectedTypes: ['slope_field', 'latex', 'text'],
  payload: {
    batch_id: 'demo-ode-direction-field',
    style_preset: 'blueprint_neat',
    colorTheme: 'colorful',
    elements: [
      {
        id: 'sf-field', type: 'slope_field',
        x: 100, y: 80, width: 700, height: 500,
        expression: 'x - y',
        xRange: [-2, 4] as [number, number],
        yRange: [-1, 5] as [number, number],
        gridRows: 12, gridCols: 14,
        strokeColor: '#6366f1',
        solutionCurve: { x0: 0, y0: 2, steps: 80 },
      } as DrawElement,
      { id: 'sf-title', type: 'latex', x: 830, y: 80, tex: "\\frac{dy}{dx} = x - y", fontSize: 22, displayMode: true, color: '#111827' },
      { id: 'sf-eq', type: 'latex', x: 830, y: 150, tex: '\\text{Equilibrium: } y = x - 1', fontSize: 16, color: '#059669' },
      { id: 'sf-ic', type: 'text', x: 830, y: 200, text: 'IC: y(0) = 2', size: 16, color: '#dc2626' },
      { id: 'sf-note', type: 'text', x: 830, y: 240, text: 'Solution converges to y = x − 1', size: 14, color: '#6b7280' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 21. Vector Field: Rotation — F(x,y) = (−y, x)
// ---------------------------------------------------------------------------
const vectorFieldRotation: LabeledDemo = {
  label: 'Vector Field: Rotation',
  description: 'Circular vector field F(x,y) = (−y, x) with normalized arrows',
  expectedElementCount: 5,
  expectedTypes: ['vector_field_2d', 'latex', 'text'],
  payload: {
    batch_id: 'demo-vector-field-rotation',
    style_preset: 'blueprint_neat',
    colorTheme: 'colorful',
    elements: [
      {
        id: 'vf-field', type: 'vector_field_2d',
        x: 100, y: 60, width: 700, height: 560,
        Px: '-y', Py: 'x',
        xRange: [-3, 3] as [number, number],
        yRange: [-3, 3] as [number, number],
        gridRows: 10, gridCols: 10,
        strokeColor: '#2563eb',
        normalize: true,
      } as DrawElement,
      { id: 'vf-title', type: 'latex', x: 830, y: 80, tex: '\\vec{F}(x,y) = (-y,\\, x)', fontSize: 22, color: '#111827' },
      { id: 'vf-desc', type: 'text', x: 830, y: 130, text: 'Counter-clockwise rotation', size: 15, color: '#2563eb' },
      { id: 'vf-curl', type: 'latex', x: 830, y: 170, tex: '\\nabla \\times \\vec{F} = 2', fontSize: 16, color: '#059669' },
      { id: 'vf-note', type: 'text', x: 830, y: 220, text: 'Divergence-free: ∇ · F = 0', size: 14, color: '#6b7280' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 22. 3D: Rotating Cube
// ---------------------------------------------------------------------------
const wireframeCube: LabeledDemo = {
  label: '3D: Rotating Cube',
  description: 'Wireframe cube with perspective rotation',
  expectedElementCount: 5,
  expectedTypes: ['wireframe_3d', 'text', 'latex'],
  payload: {
    batch_id: 'demo-wireframe-cube',
    style_preset: 'blueprint_neat',
    colorTheme: 'colorful',
    elements: [
      {
        id: 'wf-cube', type: 'wireframe_3d',
        shape: 'cube', rotationX: 25, rotationY: 35,
        cx: 500, cy: 350, size: 150,
        strokeColor: '#2563eb', strokeWidth: 2,
        showHiddenLines: true,
      } as DrawElement,
      { id: 'wf-title', type: 'text', x: 350, y: 60, text: 'Wireframe Cube', size: 24, color: '#111827' },
      { id: 'wf-rx', type: 'latex', x: 780, y: 280, tex: '\\theta_x = 25°', fontSize: 16, color: '#dc2626' },
      { id: 'wf-ry', type: 'latex', x: 780, y: 320, tex: '\\theta_y = 35°', fontSize: 16, color: '#059669' },
      { id: 'wf-info', type: 'text', x: 780, y: 370, text: 'Vertices: 8  Edges: 12', size: 14, color: '#6b7280' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 23. Sequence: Convergence — 1/n
// ---------------------------------------------------------------------------
const sequenceConvergence: LabeledDemo = {
  label: 'Sequence: Convergence — 1/n',
  description: 'Sequence aₙ = 1/n converging to 0 with limit line',
  expectedElementCount: 5,
  expectedTypes: ['sequence_plot', 'latex', 'text'],
  payload: {
    batch_id: 'demo-sequence-convergence',
    style_preset: 'mathematical',
    colorTheme: 'colorful',
    elements: [
      {
        id: 'sq-plot', type: 'sequence_plot',
        expression: '1/x', nMin: 1, nMax: 20, limit: 0,
        x: 100, y: 80, width: 700, height: 450,
        xRange: [1, 20] as [number, number],
        yRange: [-0.2, 1.2] as [number, number],
        strokeColor: '#2563eb', dotRadius: 5, showLines: true,
      } as DrawElement,
      { id: 'sq-title', type: 'latex', x: 830, y: 80, tex: 'a_n = \\frac{1}{n}', fontSize: 24, displayMode: true, color: '#111827' },
      { id: 'sq-lim', type: 'latex', x: 830, y: 160, tex: '\\lim_{n \\to \\infty} \\frac{1}{n} = 0', fontSize: 18, color: '#059669' },
      { id: 'sq-note', type: 'text', x: 830, y: 220, text: 'Dashed line: limit = 0', size: 14, color: '#dc2626' },
      { id: 'sq-conv', type: 'text', x: 830, y: 260, text: 'Monotone decreasing, bounded below', size: 13, color: '#6b7280' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 24. Bezier: Cubic Spline — S-curve
// ---------------------------------------------------------------------------
const bezierSCurve: LabeledDemo = {
  label: 'Bezier: Cubic Spline',
  description: 'Cubic Bézier S-curve with visible control points and tangents',
  expectedElementCount: 7,
  expectedTypes: ['bezier_curve', 'text', 'latex'],
  payload: {
    batch_id: 'demo-bezier-s-curve',
    style_preset: 'clean_pen_sketch',
    colorTheme: 'colorful',
    elements: [
      {
        id: 'bz-curve', type: 'bezier_curve',
        points: [[150, 500], [300, 100], [700, 600], [850, 200]] as [number, number][],
        strokeColor: '#2563eb', strokeWidth: 3,
        showControlPoints: true, showTangents: true,
      } as DrawElement,
      { id: 'bz-title', type: 'text', x: 350, y: 40, text: 'Cubic Bézier S-Curve', size: 22, color: '#111827' },
      { id: 'bz-p0', type: 'text', x: 120, y: 520, text: 'P₀ (150, 500)', size: 12, color: '#dc2626' },
      { id: 'bz-p1', type: 'text', x: 260, y: 80, text: 'P₁ (300, 100)', size: 12, color: '#d97706' },
      { id: 'bz-p2', type: 'text', x: 660, y: 618, text: 'P₂ (700, 600)', size: 12, color: '#d97706' },
      { id: 'bz-p3', type: 'text', x: 810, y: 180, text: 'P₃ (850, 200)', size: 12, color: '#059669' },
      { id: 'bz-eq', type: 'latex', x: 300, y: 660, tex: 'B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t)t^2 P_2 + t^3 P_3', fontSize: 14, color: '#374151' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 25. Number Theory: Multiplication Table mod 7
// ---------------------------------------------------------------------------
const multTableMod7Highlights: Array<{ i: number; j: number; color?: string; label?: string }> = [];
for (let i = 1; i < 7; i++) {
  for (let j = 1; j < 7; j++) {
    const prod = (i * j) % 7;
    const color = prod === 1 ? '#22c55e' : prod === 0 ? '#f87171' : '#60a5fa';
    multTableMod7Highlights.push({ i, j, color, label: String(prod) });
  }
}

const multTableMod7: LabeledDemo = {
  label: 'Number Theory: Multiplication Table mod 7',
  description: '7×7 multiplication table modulo 7 with highlighted units',
  expectedElementCount: 5,
  expectedTypes: ['number_theory_grid', 'latex', 'text'],
  payload: {
    batch_id: 'demo-mult-table-mod7',
    style_preset: 'mathematical',
    colorTheme: 'colorful',
    elements: [
      {
        id: 'nt-grid', type: 'number_theory_grid',
        n: 7, highlights: multTableMod7Highlights,
        showConnections: true, modulus: 7,
        cx: 500, cy: 350, cellSize: 40,
      } as DrawElement,
      { id: 'nt-title', type: 'latex', x: 350, y: 40, tex: '\\mathbb{Z}/7\\mathbb{Z} \\text{ Multiplication Table}', fontSize: 22, color: '#111827' },
      { id: 'nt-legend1', type: 'text', x: 800, y: 250, text: '● Green = multiplicative inverse (≡ 1)', size: 13, color: '#22c55e' },
      { id: 'nt-legend2', type: 'text', x: 800, y: 280, text: '● Blue = other products', size: 13, color: '#2563eb' },
      { id: 'nt-note', type: 'text', x: 800, y: 320, text: 'Every nonzero element is a unit (7 is prime)', size: 13, color: '#6b7280' },
    ],
  },
};

// ---------------------------------------------------------------------------
// 26. Complex: Mandelbrot-inspired — critical orbit of c = 0.25
// ---------------------------------------------------------------------------
const mandelbrotOrbit: LabeledDemo = {
  label: 'Complex: Mandelbrot-inspired Orbit',
  description: 'Critical orbit of c = 0.25 on the complex plane with iteration labels',
  expectedElementCount: 5,
  expectedTypes: ['complex_plane', 'latex', 'text'],
  payload: {
    batch_id: 'demo-mandelbrot-orbit',
    style_preset: 'mathematical',
    colorTheme: 'colorful',
    elements: [
      {
        id: 'mb-plane', type: 'complex_plane',
        points: [
          { re: 0, im: 0, label: 'z₀ = 0', color: '#dc2626' },
          { re: 0.25, im: 0, label: 'z₁', color: '#d97706' },
          { re: 0.3125, im: 0, label: 'z₂', color: '#059669' },
          { re: 0.3477, im: 0, label: 'z₃', color: '#2563eb' },
          { re: 0.3709, im: 0, label: 'z₄', color: '#7c3aed' },
          { re: 0.3876, im: 0, label: 'z₅', color: '#db2777' },
          { re: 0.5, im: 0, label: 'z* = 0.5', color: '#111827' },
        ],
        showUnitCircle: false,
        xRange: [-0.5, 1.5] as [number, number],
        yRange: [-1, 1] as [number, number],
        strokeColor: '#374151',
      } as DrawElement,
      { id: 'mb-title', type: 'latex', x: 80, y: 30, tex: '\\text{Mandelbrot Orbit: } c = 0.25', fontSize: 22, color: '#111827' },
      { id: 'mb-iter', type: 'latex', x: 80, y: 70, tex: 'z_{n+1} = z_n^2 + c, \\quad z_0 = 0', fontSize: 16, color: '#374151' },
      { id: 'mb-conv', type: 'latex', x: 80, y: 110, tex: 'z_n \\to z^* = 0.5 \\text{ (fixed point)}', fontSize: 16, color: '#059669' },
      { id: 'mb-note', type: 'text', x: 80, y: 150, text: 'c = 0.25 lies inside the Mandelbrot set', size: 14, color: '#6b7280' },
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
  ftcDemo,
  rotation2D,
  normalDistribution,
  derivativeAtPoint,
  lissajousFigure,
  roseCurve,
  matrixOperations,
  probabilityTree,
  complexPlaneRoots,
  odeDirectionField,
  vectorFieldRotation,
  wireframeCube,
  sequenceConvergence,
  bezierSCurve,
  multTableMod7,
  mandelbrotOrbit,
];
