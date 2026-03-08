import { describe, it, expect } from 'vitest';
import {
  lowerMathPrimitive,
  lowerPlannedLayoutToDrawBatch,
  DEFAULT_MAX_LOWERED_ELEMENTS,
} from '../planner/lowerer';
import type { DrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Time an expansion and return { elements, ms }. */
function timeExpansion(el: DrawElement) {
  const start = performance.now();
  const elements = lowerMathPrimitive(el as Parameters<typeof lowerMathPrimitive>[0]);
  const ms = performance.now() - start;
  return { elements, ms };
}

/** Build a minimal PlannedSemanticLayout from elements. */
function makeLayout(elements: DrawElement[]): PlannedSemanticLayout {
  return {
    batchId: 'perf-test',
    stylePreset: 'blueprint_neat',
    templateUsed: 'freeform',
    elements,
    anchors: [],
    semanticBatch: { blocks: [] },
    warnings: [],
  };
}

const MAX_SINGLE_ELEMENT_MS = 50;

// ---------------------------------------------------------------------------
// 1. Single cartesian_axes expansion
// ---------------------------------------------------------------------------

describe('Complex scene performance benchmarks', () => {
  it('cartesian_axes — expansion time + element count', () => {
    const { elements, ms } = timeExpansion({
      id: 'axes-1',
      type: 'cartesian_axes',
      x: 100, y: 50, width: 600, height: 400,
      xRange: [-5, 5], yRange: [-3, 10],
      xLabel: 'x', yLabel: 'y', gridlines: true,
    });

    console.log(`  cartesian_axes → ${elements.length} elements in ${ms.toFixed(2)}ms`);
    expect(elements.length).toBeGreaterThanOrEqual(40);
    expect(ms).toBeLessThan(MAX_SINGLE_ELEMENT_MS);
  });

  // ---------------------------------------------------------------------------
  // 2. Three function_curve elements with complex expressions
  // ---------------------------------------------------------------------------

  it('3 function_curves (complex expressions) — expansion time', () => {
    const curves: DrawElement[] = [
      {
        id: 'fc-sin', type: 'function_curve',
        x: 100, y: 50, width: 500, height: 300,
        xRange: [-6, 6], yRange: [-2, 2],
        expression: 'sin(x) * cos(x/2)',
        style: 'mathematical',
      },
      {
        id: 'fc-poly', type: 'function_curve',
        x: 100, y: 50, width: 500, height: 300,
        xRange: [-3, 3], yRange: [-10, 10],
        expression: 'x^3 - 2*x^2 + x - 1',
        style: 'mathematical',
      },
      {
        id: 'fc-exp', type: 'function_curve',
        x: 100, y: 50, width: 500, height: 300,
        xRange: [-2, 4], yRange: [0, 20],
        expression: 'exp(x) / (1 + exp(x))',
        style: 'mathematical',
      },
    ];

    let totalElements = 0;
    const start = performance.now();
    for (const c of curves) {
      const expanded = lowerMathPrimitive(c as Parameters<typeof lowerMathPrimitive>[0]);
      totalElements += expanded.length;
    }
    const ms = performance.now() - start;

    console.log(`  3 function_curves → ${totalElements} elements in ${ms.toFixed(2)}ms`);
    expect(totalElements).toBeGreaterThan(0);
    expect(ms).toBeLessThan(MAX_SINGLE_ELEMENT_MS * 3);
  });

  // ---------------------------------------------------------------------------
  // 3. cartesian_axes + 2 function_curve + integral_region
  // ---------------------------------------------------------------------------

  it('axes + 2 curves + integral — total count + time', () => {
    const elements: DrawElement[] = [
      {
        id: 'combo-axes', type: 'cartesian_axes',
        x: 100, y: 50, width: 600, height: 400,
        xRange: [-1, 5], yRange: [-1, 12],
        xLabel: 'x', yLabel: 'y', gridlines: true,
      },
      {
        id: 'combo-fc1', type: 'function_curve',
        x: 100, y: 50, width: 600, height: 400,
        xRange: [-1, 5], yRange: [-1, 12],
        expression: 'x^2',
        style: 'mathematical',
      },
      {
        id: 'combo-fc2', type: 'function_curve',
        x: 100, y: 50, width: 600, height: 400,
        xRange: [-1, 5], yRange: [-1, 12],
        expression: 'sin(x) + 3',
        style: 'mathematical',
      },
      {
        id: 'combo-int', type: 'integral_region',
        x: 100, y: 50, width: 600, height: 400,
        xRange: [1, 3], yRange: [-1, 12],
        expression: 'x^2',
      },
    ];

    const start = performance.now();
    let totalCount = 0;
    for (const el of elements) {
      const expanded = lowerMathPrimitive(el as Parameters<typeof lowerMathPrimitive>[0]);
      totalCount += expanded.length;
    }
    const ms = performance.now() - start;

    console.log(`  axes + 2 curves + integral → ${totalCount} elements in ${ms.toFixed(2)}ms`);
    expect(totalCount).toBeGreaterThan(100);
    expect(ms).toBeLessThan(MAX_SINGLE_ELEMENT_MS * 4);
  });

  // ---------------------------------------------------------------------------
  // 4. histogram (20 bins) + normal_distribution
  // ---------------------------------------------------------------------------

  it('histogram (20 bins) + normal_distribution — count + time', () => {
    const bins = Array.from({ length: 20 }, (_, i) => ({
      label: `${i}`,
      value: Math.round(100 * Math.exp(-((i - 10) ** 2) / 20)),
    }));

    const histEl: DrawElement = {
      id: 'hist-20', type: 'histogram',
      x: 50, y: 50, width: 700, height: 350,
      bins,
      showValues: true,
      showAxes: true,
      xLabel: 'Bins', yLabel: 'Freq',
    };

    const normEl: DrawElement = {
      id: 'norm-1', type: 'normal_distribution',
      x: 50, y: 450, width: 700, height: 300,
      mu: 10, sigma: 3,
      showMeanLine: true,
      showSigmaLines: true,
      showLabels: true,
      shadeFrom: 7, shadeTo: 13,
    };

    const start = performance.now();
    const histExpanded = lowerMathPrimitive(histEl as Parameters<typeof lowerMathPrimitive>[0]);
    const normExpanded = lowerMathPrimitive(normEl as Parameters<typeof lowerMathPrimitive>[0]);
    const ms = performance.now() - start;
    const totalCount = histExpanded.length + normExpanded.length;

    console.log(`  histogram(20) → ${histExpanded.length} elements`);
    console.log(`  normal_distribution → ${normExpanded.length} elements`);
    console.log(`  total → ${totalCount} elements in ${ms.toFixed(2)}ms`);
    expect(histExpanded.length).toBeGreaterThan(60);
    expect(normExpanded.length).toBeGreaterThan(100);
    expect(ms).toBeLessThan(MAX_SINGLE_ELEMENT_MS * 2);
  });

  // ---------------------------------------------------------------------------
  // 5. linear_transform (gridRange=3, 3 vectors)
  // ---------------------------------------------------------------------------

  it('linear_transform (3×3 grid + 3 vectors) — count + time', () => {
    const ltEl: DrawElement = {
      id: 'lt-1', type: 'linear_transform',
      x: 100, y: 100, width: 500, height: 500,
      matrix: [[2, 1], [0, 1]],
      gridRange: 3,
      showBasisVectors: true,
      showOriginalGrid: true,
      vectors: [
        { x: 1, y: 0, label: 'v1', color: '#e11d48' },
        { x: 0, y: 1, label: 'v2', color: '#2563eb' },
        { x: 1, y: 1, label: 'v3', color: '#16a34a' },
      ],
      label: 'T',
    };

    const { elements, ms } = timeExpansion(ltEl);

    console.log(`  linear_transform(3×3 + 3 vectors) → ${elements.length} elements in ${ms.toFixed(2)}ms`);
    expect(elements.length).toBeGreaterThan(20);
    expect(ms).toBeLessThan(MAX_SINGLE_ELEMENT_MS);
  });

  // ---------------------------------------------------------------------------
  // 6. Worst case: all 15 math primitive types combined — verify cap
  // ---------------------------------------------------------------------------

  it('worst case (all 15 types) — total ≤ DEFAULT_MAX_LOWERED_ELEMENTS after cap', () => {
    const allElements: DrawElement[] = [
      // 1. cartesian_axes
      {
        id: 'wc-axes', type: 'cartesian_axes',
        x: 0, y: 0, width: 600, height: 400,
        xRange: [-5, 5], yRange: [-5, 5],
        xLabel: 'x', yLabel: 'y', gridlines: true,
      },
      // 2. function_curve
      {
        id: 'wc-fc', type: 'function_curve',
        x: 0, y: 0, width: 600, height: 400,
        xRange: [-5, 5], yRange: [-5, 5],
        expression: 'sin(x)',
        style: 'mathematical',
      },
      // 3. integral_region
      {
        id: 'wc-int', type: 'integral_region',
        x: 0, y: 0, width: 600, height: 400,
        xRange: [0, 3], yRange: [-1, 5],
        expression: 'x^2',
      },
      // 4. number_line
      {
        id: 'wc-nl', type: 'number_line',
        x: 50, y: 500, length: 500,
        min: -5, max: 5,
        highlights: [{ value: 0, label: '0' }, { value: 2, label: '2' }],
      },
      // 5. vector_arrow
      {
        id: 'wc-va', type: 'vector_arrow',
        x: 300, y: 300, dx: 100, dy: -80,
        label: 'v',
      },
      // 6. angle_arc
      {
        id: 'wc-arc', type: 'angle_arc',
        x: 400, y: 400, radius: 30,
        startAngle: 0, endAngle: 60,
        label: 'θ',
      },
      // 7. circle_with_radius
      {
        id: 'wc-circle', type: 'circle_with_radius',
        cx: 200, cy: 200, r: 80,
        label: 'r', showCenter: true, showRadius: true,
      },
      // 8. triangle_with_angles
      {
        id: 'wc-tri', type: 'triangle_with_angles',
        vertices: [
          { x: 100, y: 500, label: 'A' },
          { x: 300, y: 500, label: 'B' },
          { x: 200, y: 350, label: 'C' },
        ],
        showAngles: true, showSides: true,
      },
      // 9. parametric_curve
      {
        id: 'wc-param', type: 'parametric_curve',
        x: 0, y: 0, width: 400, height: 400,
        xRange: [-2, 2], yRange: [-2, 2],
        tMin: 0, tMax: 6.2832,
        xExpression: 'cos(t)', yExpression: 'sin(t)',
      },
      // 10. polar_plot
      {
        id: 'wc-polar', type: 'polar_plot',
        cx: 500, cy: 500, radius: 150,
        expression: '1 + cos(theta)',
      },
      // 11. histogram
      {
        id: 'wc-hist', type: 'histogram',
        x: 650, y: 50, width: 300, height: 200,
        bins: Array.from({ length: 10 }, (_, i) => ({ label: `${i}`, value: (i + 1) * 5 })),
        showValues: true, showAxes: true,
      },
      // 12. normal_distribution
      {
        id: 'wc-norm', type: 'normal_distribution',
        x: 650, y: 300, width: 300, height: 200,
        mu: 0, sigma: 1,
        showMeanLine: true, showSigmaLines: true, showLabels: true,
        shadeFrom: -1, shadeTo: 1,
      },
      // 13. riemann_sum
      {
        id: 'wc-riemann', type: 'riemann_sum',
        x: 0, y: 600, width: 400, height: 300,
        xRange: [0, 4], yRange: [0, 20],
        expression: 'x^2', n: 8,
      },
      // 14. tangent_line
      {
        id: 'wc-tangent', type: 'tangent_line',
        x: 0, y: 0, width: 600, height: 400,
        xRange: [-5, 5], yRange: [-5, 5],
        expression: 'x^2', atX: 2,
        label: "f'(2)=4",
      },
      // 15. matrix_bracket
      {
        id: 'wc-matrix', type: 'matrix_bracket',
        x: 800, y: 600,
        rows: [['1', '0', '0'], ['0', '1', '0'], ['0', '0', '1']],
        bracketStyle: '[]',
      },
      // 16. linear_transform
      {
        id: 'wc-lt', type: 'linear_transform',
        x: 400, y: 600, width: 350, height: 350,
        matrix: [[1, 2], [0, 1]],
        gridRange: 3,
        vectors: [{ x: 1, y: 1, label: 'u' }],
      },
    ];

    const layout = makeLayout(allElements);

    const start = performance.now();
    const batch = lowerPlannedLayoutToDrawBatch(layout);
    const ms = performance.now() - start;

    console.log(`  worst case (all types) → ${batch.elements.length} elements in ${ms.toFixed(2)}ms`);
    console.log(`  DEFAULT_MAX_LOWERED_ELEMENTS = ${DEFAULT_MAX_LOWERED_ELEMENTS}`);

    // Verify cap is enforced
    expect(batch.elements.length).toBeLessThanOrEqual(DEFAULT_MAX_LOWERED_ELEMENTS);
    expect(batch.elements.length).toBeGreaterThan(0);
    // Should complete within a reasonable time
    expect(ms).toBeLessThan(200);
  });

  // ---------------------------------------------------------------------------
  // 7. Cap is applied gracefully (no throws on over-cap scenes)
  // ---------------------------------------------------------------------------

  it('over-cap scene does not throw and truncates gracefully', () => {
    // Build a scene guaranteed to exceed the cap: many function curves
    const elements: DrawElement[] = [];
    for (let i = 0; i < 10; i++) {
      elements.push({
        id: `stress-fc-${i}`, type: 'function_curve',
        x: 0, y: 0, width: 600, height: 400,
        xRange: [-5, 5], yRange: [-5, 5],
        expression: `sin(x + ${i})`,
        style: 'mathematical',
      });
    }
    // Also add axes with gridlines to push total higher
    elements.push({
      id: 'stress-axes', type: 'cartesian_axes',
      x: 0, y: 0, width: 600, height: 400,
      xRange: [-5, 5], yRange: [-5, 5],
      gridlines: true, xLabel: 'x', yLabel: 'y',
    });

    const layout = makeLayout(elements);

    // Should NOT throw
    const batch = lowerPlannedLayoutToDrawBatch(layout);

    expect(batch.elements.length).toBeLessThanOrEqual(DEFAULT_MAX_LOWERED_ELEMENTS);
    expect(batch.elements.length).toBeGreaterThan(0);
    // Warnings should indicate capping occurred
    expect(layout.warnings).toContain('element_count_capped');

    console.log(`  stress scene → capped to ${batch.elements.length} (warnings: ${layout.warnings.join(', ')})`);
  });

  // ---------------------------------------------------------------------------
  // 8. Individual element expansion timings stay under threshold
  // ---------------------------------------------------------------------------

  it.each([
    ['cartesian_axes', { id: 'bench-axes', type: 'cartesian_axes' as const, x: 0, y: 0, width: 600, height: 400, xRange: [-10, 10] as [number, number], yRange: [-10, 10] as [number, number], gridlines: true }],
    ['function_curve', { id: 'bench-fc', type: 'function_curve' as const, x: 0, y: 0, width: 600, height: 400, xRange: [-10, 10] as [number, number], yRange: [-10, 10] as [number, number], expression: 'sin(x)*x^2' }],
    ['normal_distribution', { id: 'bench-norm', type: 'normal_distribution' as const, x: 0, y: 0, width: 600, height: 400, mu: 0, sigma: 1, shadeFrom: -1, shadeTo: 1, showSigmaLines: true, showLabels: true }],
    ['polar_plot', { id: 'bench-polar', type: 'polar_plot' as const, cx: 300, cy: 300, radius: 200, expression: '2 + cos(3*theta)', showPolarGrid: true }],
    ['riemann_sum', { id: 'bench-riemann', type: 'riemann_sum' as const, x: 0, y: 0, width: 600, height: 400, xRange: [0, 5] as [number, number], yRange: [0, 30] as [number, number], expression: 'x^2', n: 10 }],
  ])('%s expands in < 50ms', (_label, el) => {
    const { elements, ms } = timeExpansion(el as DrawElement);
    console.log(`    ${_label} → ${elements.length} elements in ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(MAX_SINGLE_ELEMENT_MS);
    expect(elements.length).toBeGreaterThan(0);
  });
});
