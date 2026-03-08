/**
 * Comprehensive stress-test payloads for the DrawBatch injection pipeline.
 *
 * Each payload exercises one or more math primitive types with realistic,
 * mathematically meaningful data targeting a 1400×700 canvas.
 *
 * Pipeline under test:
 *   DrawBatch JSON → schema validate → normalize → lower math prims
 *                  → compile to strokes → animate onto canvas
 */

// Pre-sampled points for function curves (lowerer needs either `expression` or `points`)
function sampleSin(
  xMin: number, xMax: number, steps: number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    pts.push({ x, y: Math.sin(x) });
  }
  return pts;
}

function sampleCos(
  xMin: number, xMax: number, steps: number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    pts.push({ x, y: Math.cos(x) });
  }
  return pts;
}

function sampleGaussian(
  xMin: number, xMax: number, steps: number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    pts.push({ x, y: Math.exp(-(x * x) / 2) });
  }
  return pts;
}

function sampleReciprocal(
  xMin: number, xMax: number, steps: number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    if (Math.abs(x) < 0.05) continue; // skip discontinuity
    pts.push({ x, y: 1 / x });
  }
  return pts;
}

function sampleXSquared(
  xMin: number, xMax: number, steps: number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * (xMax - xMin);
    pts.push({ x, y: x * x });
  }
  return pts;
}

// ── Labeled payload type ────────────────────────────────────────────────────

export interface StressPayload {
  label: string;
  description: string;
  payload: Record<string, unknown>;
  /** Types that are NOT in the Zod DrawElementSchema discriminated union. */
  hasNonSchemaTypes: boolean;
}

// ── Canvas constants ────────────────────────────────────────────────────────

const CW = 1400; // canvas width
const CH = 700;  // canvas height

// ── Payloads ────────────────────────────────────────────────────────────────

export const stressPayloads: StressPayload[] = [
  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  1. cartesian_axes – standard x/y axes                                 │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '01 · cartesian_axes',
    description: 'Standard math axes with gridlines, x ∈ [-5,5], y ∈ [-5,5]',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-01-axes',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'axes-1',
          type: 'cartesian_axes',
          x: 100,
          y: 50,
          width: 500,
          height: 500,
          xRange: [-5, 5],
          yRange: [-5, 5],
          xLabel: 'x',
          yLabel: 'y',
          gridlines: true,
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  2. number_line – range [-5, 5] with √2 highlighted                    │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '02 · number_line (√2)',
    description: 'Number line from -5 to 5, √2 ≈ 1.414 highlighted',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-02-numline',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'nl-1',
          type: 'number_line',
          x: 100,
          y: 350,
          length: 800,
          min: -5,
          max: 5,
          label: 'ℝ',
          highlights: [{ value: 1.414, label: '√2' }],
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  3. vector_arrow × 2 – vector addition A + B                           │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '03 · vector_arrow addition',
    description: 'Vectors A=(3,1) and B=(1,3) with visual addition',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-03-vectors',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'vec-a',
          type: 'vector_arrow',
          x: 200,
          y: 500,
          dx: 150,
          dy: -50,
          label: 'A⃗',
          color: '#2196F3',
          style: 'blueprint_neat',
        },
        {
          id: 'vec-b',
          type: 'vector_arrow',
          x: 200,
          y: 500,
          dx: 50,
          dy: -150,
          label: 'B⃗',
          color: '#4CAF50',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  4. function_curve – sin(x) over [-2π, 2π]                             │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '04 · function_curve sin(x)',
    description: 'y = sin(x) sampled over [-2π, 2π]',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-04-sinx',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'fc-sin',
          type: 'function_curve',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          xRange: [-6.283, 6.283],
          yRange: [-1.5, 1.5],
          expression: 'Math.sin(x)',
          label: 'y = sin(x)',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  5. function_curve – Gaussian bell curve e^(-x²/2)                     │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '05 · function_curve Gaussian',
    description: 'y = e^(-x²/2) bell curve',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-05-gaussian',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'fc-gauss',
          type: 'function_curve',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          xRange: [-4, 4],
          yRange: [-0.2, 1.2],
          points: sampleGaussian(-4, 4, 100),
          label: 'y = e^(-x²/2)',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  6. function_curve – 1/x with discontinuity                            │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '06 · function_curve 1/x',
    description: 'y = 1/x with discontinuity at x=0 skipped',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-06-reciprocal',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'fc-recip',
          type: 'function_curve',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          xRange: [-5, 5],
          yRange: [-5, 5],
          points: sampleReciprocal(-5, 5, 200),
          label: 'y = 1/x',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  7. matrix_bracket – 2×2 identity matrix                               │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '07 · matrix_bracket I₂',
    description: '2×2 identity matrix with square brackets',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-07-matrix',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'mat-id',
          type: 'matrix_bracket',
          x: 300,
          y: 200,
          rows: [['1', '0'], ['0', '1']],
          bracketStyle: '[]',
          cellWidth: 40,
          cellHeight: 40,
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  8. angle_arc – 60° angle                                              │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '08 · angle_arc 60°',
    description: '60-degree angle arc at a vertex',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-08-angle',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'arc-60',
          type: 'angle_arc',
          x: 400,
          y: 400,
          radius: 60,
          startAngle: 0,
          endAngle: 60,
          label: '60°',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  9. integral_region – ∫₀² x² dx                                        │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '09 · integral_region ∫x²',
    description: 'Shaded area under x² from 0 to 2',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-09-integral',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'int-x2',
          type: 'integral_region',
          x: 100,
          y: 50,
          width: 500,
          height: 400,
          xRange: [-1, 3],
          yRange: [-0.5, 5],
          topPoints: sampleXSquared(0, 2, 40),
          fillColor: 'rgba(33,150,243,0.3)',
          label: '∫₀² x² dx = 8/3',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  10. circle_with_radius – r = 3                                        │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '10 · circle_with_radius r=3',
    description: 'Unit circle showing radius r = 3',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-10-circle',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'circ-r3',
          type: 'circle_with_radius',
          cx: 500,
          cy: 350,
          r: 120,
          label: 'r = 3',
          showCenter: true,
          showRadius: true,
          radiusAngle: 45,
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  11. triangle_with_angles – right triangle                             │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '11 · triangle right triangle',
    description: '3-4-5 right triangle with labeled sides',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-11-triangle',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'tri-345',
          type: 'triangle_with_angles',
          vertices: [
            { x: 200, y: 500, label: 'A' },
            { x: 500, y: 500, label: 'B' },
            { x: 200, y: 200, label: 'C' },
          ],
          showAngles: true,
          showSides: true,
          sideLabels: ['3', '5', '4'],
          angleLabels: ['90°', 'β', 'α'],
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  12. parametric_curve – Lissajous (sin(3t), sin(2t))                   │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '12 · parametric Lissajous',
    description: 'Lissajous figure: x = sin(3t), y = sin(2t)',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-12-lissajous',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'param-liss',
          type: 'parametric_curve',
          x: 100,
          y: 50,
          width: 500,
          height: 500,
          xRange: [-1.5, 1.5],
          yRange: [-1.5, 1.5],
          tMin: 0,
          tMax: 6.283185,
          xExpression: 'sin(3*t)',
          yExpression: 'sin(2*t)',
          steps: 300,
          label: 'Lissajous (3:2)',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  13. polar_plot – cardioid r = 1 + cos(θ)                              │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '13 · polar cardioid',
    description: 'Cardioid r = 1 + cos(θ)',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-13-cardioid',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'polar-card',
          type: 'polar_plot',
          cx: 500,
          cy: 350,
          radius: 200,
          expression: '1 + cos(theta)',
          thetaMin: 0,
          thetaMax: 6.283185,
          steps: 200,
          showPolarGrid: true,
          label: 'r = 1 + cos(θ)',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  14. histogram – frequency distribution                                │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '14 · histogram',
    description: 'Frequency histogram with 6 bins',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-14-histogram',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'hist-1',
          type: 'histogram',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          bins: [
            { label: '0–10', value: 5 },
            { label: '10–20', value: 12 },
            { label: '20–30', value: 18 },
            { label: '30–40', value: 25 },
            { label: '40–50', value: 15 },
            { label: '50–60', value: 8 },
          ],
          showValues: true,
          showAxes: true,
          xLabel: 'Score',
          yLabel: 'Frequency',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  15. normal_distribution – μ=0, σ=1 with shaded region                 │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '15 · normal_distribution',
    description: 'Standard normal N(0,1) with shaded P(-1 < X < 1)',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-15-normal',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'norm-1',
          type: 'normal_distribution',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          mu: 0,
          sigma: 1,
          shadeFrom: -1,
          shadeTo: 1,
          shadeColor: 'rgba(76,175,80,0.3)',
          showMeanLine: true,
          showSigmaLines: true,
          showLabels: true,
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  16. linear_transform – 2D shear matrix                                │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '16 · linear_transform shear',
    description: '2×2 shear transform [[1,1],[0,1]] applied to basis vectors',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-16-lintrans',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'lt-shear',
          type: 'linear_transform',
          x: 100,
          y: 50,
          width: 500,
          height: 500,
          matrix: [[1, 1], [0, 1]],
          showBasisVectors: true,
          showOriginalGrid: true,
          gridRange: 3,
          label: 'Shear: [[1,1],[0,1]]',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  17. riemann_sum – left Riemann sum for x²                             │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '17 · riemann_sum',
    description: 'Left Riemann sum for x² on [0, 3] with n=6',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-17-riemann',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'rs-x2',
          type: 'riemann_sum',
          x: 100,
          y: 50,
          width: 500,
          height: 400,
          xRange: [-0.5, 3.5],
          yRange: [-0.5, 10],
          expression: 'x^2',
          n: 6,
          method: 'left',
          showFunction: true,
          showAxes: true,
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  18. tangent_line – tangent to x² at x=1                               │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '18 · tangent_line',
    description: 'Tangent line to y = x² at x = 1 (slope = 2)',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-18-tangent',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'tl-x2',
          type: 'tangent_line',
          x: 100,
          y: 50,
          width: 500,
          height: 400,
          xRange: [-2, 4],
          yRange: [-1, 8],
          expression: 'x^2',
          atX: 1,
          length: 3,
          showPoint: true,
          label: "f'(1) = 2",
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  //  COMBINATION PAYLOADS
  // ═════════════════════════════════════════════════════════════════════════

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  19. COMBO: axes + sin(x) + cos(x) + labels                           │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '19 · COMBO axes + sin + cos',
    description: 'Axes with sin(x) and cos(x) curves overlaid, plus labels',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-19-combo-trig',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'combo-axes',
          type: 'cartesian_axes',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          xRange: [-6.3, 6.3],
          yRange: [-1.5, 1.5],
          xLabel: 'x',
          yLabel: 'y',
          gridlines: true,
          style: 'blueprint_neat',
        },
        {
          id: 'combo-sin',
          type: 'function_curve',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          xRange: [-6.3, 6.3],
          yRange: [-1.5, 1.5],
          points: sampleSin(-6.283, 6.283, 120),
          label: 'sin(x)',
          color: '#2196F3',
          style: 'blueprint_neat',
        },
        {
          id: 'combo-cos',
          type: 'function_curve',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          xRange: [-6.3, 6.3],
          yRange: [-1.5, 1.5],
          points: sampleCos(-6.283, 6.283, 120),
          label: 'cos(x)',
          color: '#FF5722',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  20. COMBO: number_line + highlighted point + inequality text           │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '20 · COMBO number line + annotation',
    description: 'Number line with highlighted interval and inequality label',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-20-combo-numline',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'nl-ineq',
          type: 'number_line',
          x: 100,
          y: 300,
          length: 900,
          min: -5,
          max: 5,
          label: 'x',
          highlights: [
            { value: -2, label: '-2' },
            { value: 3, label: '3' },
          ],
          intervals: [{ from: -2, to: 3, color: '#2196F3' }],
          style: 'blueprint_neat',
        },
        {
          id: 'nl-label',
          type: 'text',
          x: 400,
          y: 250,
          text: '-2 ≤ x ≤ 3',
          color: '#1976D2',
          size: 20,
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  21. COMBO: vectors A, B, A+B with labels                              │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '21 · COMBO vector A + B = C',
    description: 'Three vectors showing A + B = C with parallelogram rule',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-21-combo-vec',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'va',
          type: 'vector_arrow',
          x: 200,
          y: 500,
          dx: 200,
          dy: -80,
          label: 'A⃗ = (4,2)',
          color: '#2196F3',
          style: 'blueprint_neat',
        },
        {
          id: 'vb',
          type: 'vector_arrow',
          x: 400,
          y: 420,
          dx: 80,
          dy: -200,
          label: 'B⃗ = (2,4)',
          color: '#4CAF50',
          style: 'blueprint_neat',
        },
        {
          id: 'vc',
          type: 'vector_arrow',
          x: 200,
          y: 500,
          dx: 280,
          dy: -280,
          label: 'A⃗ + B⃗ = (6,6)',
          color: '#F44336',
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  22. COMBO: axes + function + tangent_line                             │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '22 · COMBO axes + curve + tangent',
    description: 'Cartesian axes with sin(x) and tangent line at π/4',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-22-combo-tangent',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'ct-axes',
          type: 'cartesian_axes',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          xRange: [-3.5, 3.5],
          yRange: [-1.5, 1.5],
          xLabel: 'x',
          yLabel: 'y',
          gridlines: true,
          style: 'blueprint_neat',
        },
        {
          id: 'ct-tangent',
          type: 'tangent_line',
          x: 100,
          y: 50,
          width: 600,
          height: 400,
          xRange: [-3.5, 3.5],
          yRange: [-1.5, 1.5],
          expression: 'sin(x)',
          atX: 0.7854,
          length: 2,
          showPoint: true,
          label: "slope ≈ cos(π/4) ≈ 0.707",
          style: 'blueprint_neat',
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  23. COMBO: matrix + formula (determinant)                             │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '23 · COMBO matrix + determinant',
    description: '2×2 matrix with determinant formula as LaTeX',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-23-combo-det',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'mat-det',
          type: 'matrix_bracket',
          x: 200,
          y: 200,
          rows: [['a', 'b'], ['c', 'd']],
          bracketStyle: '||',
          cellWidth: 40,
          cellHeight: 40,
          style: 'blueprint_neat',
        },
        {
          id: 'det-formula',
          type: 'text',
          x: 350,
          y: 230,
          text: '= ad − bc',
          size: 22,
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  24. COMBO: integral_region + labels at boundaries                     │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '24 · COMBO integral + boundary labels',
    description: 'Integral region with labeled limits and area annotation',
    hasNonSchemaTypes: false,
    payload: {
      batch_id: 'stress-24-combo-intlabels',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'int-reg',
          type: 'integral_region',
          x: 100,
          y: 50,
          width: 500,
          height: 400,
          xRange: [-1, 4],
          yRange: [-0.5, 5],
          topPoints: sampleXSquared(1, 3, 40),
          fillColor: 'rgba(156,39,176,0.25)',
          label: '∫₁³ x² dx',
          style: 'blueprint_neat',
        },
        {
          id: 'int-a-label',
          type: 'text',
          x: 200,
          y: 470,
          text: 'a = 1',
          size: 16,
        },
        {
          id: 'int-b-label',
          type: 'text',
          x: 400,
          y: 470,
          text: 'b = 3',
          size: 16,
        },
        {
          id: 'int-area',
          type: 'text',
          x: 280,
          y: 500,
          text: 'Area = 26/3 ≈ 8.667',
          size: 14,
        },
      ],
    },
  },

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  25. COMPLEX: full calculus diagram                                     │
  // │     axes + sin(x) + tangent at π/4 + shaded integral [0, π]           │
  // └─────────────────────────────────────────────────────────────────────────┘
  {
    label: '25 · COMPLEX full calculus diagram',
    description: 'Axes, sin(x) curve, tangent at π/4, integral region [0,π]',
    hasNonSchemaTypes: true,
    payload: {
      batch_id: 'stress-25-complex-calc',
      style_preset: 'blueprint_neat',
      elements: [
        {
          id: 'calc-axes',
          type: 'cartesian_axes',
          x: 50,
          y: 30,
          width: 700,
          height: 450,
          xRange: [-1, 4],
          yRange: [-0.5, 1.5],
          xLabel: 'x',
          yLabel: 'y',
          gridlines: true,
          style: 'blueprint_neat',
        },
        {
          id: 'calc-integral',
          type: 'integral_region',
          x: 50,
          y: 30,
          width: 700,
          height: 450,
          xRange: [-1, 4],
          yRange: [-0.5, 1.5],
          topPoints: sampleSin(0, 3.14159, 60),
          fillColor: 'rgba(33,150,243,0.2)',
          label: '∫₀^π sin(x) dx = 2',
          style: 'blueprint_neat',
        },
        {
          id: 'calc-tangent',
          type: 'tangent_line',
          x: 50,
          y: 30,
          width: 700,
          height: 450,
          xRange: [-1, 4],
          yRange: [-0.5, 1.5],
          expression: 'sin(x)',
          atX: 0.7854,
          length: 1.5,
          showPoint: true,
          label: 'tangent at π/4',
          style: 'blueprint_neat',
        },
        {
          id: 'calc-title',
          type: 'text',
          x: 250,
          y: 500,
          text: 'Calculus: Integration & Differentiation',
          size: 18,
        },
      ],
    },
  },
];
