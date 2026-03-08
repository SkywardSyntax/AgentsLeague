import { describe, it, expect } from 'vitest';
import type { DrawElement, ArrowElement, LineElement, TextElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';
import {
  lowerPlannedLayoutToDrawBatch,
  lowerMathPrimitive,
} from '../planner/lowerer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PlannedSemanticLayout wrapping the given elements. */
function makeLayout(elements: DrawElement[], maxElements = 200): PlannedSemanticLayout {
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

/** Lower a single math primitive element through the full pipeline. */
function lowerSingle(el: DrawElement, maxElements = 200) {
  const layout = makeLayout([el], maxElements);
  return lowerPlannedLayoutToDrawBatch(layout, { maxElements });
}

function countByType(elements: DrawElement[], type: string) {
  return elements.filter((e) => e.type === type).length;
}

const arrows = (els: DrawElement[]) => els.filter((e): e is ArrowElement => e.type === 'arrow');
const lines = (els: DrawElement[]) => els.filter((e): e is LineElement => e.type === 'line');
const texts = (els: DrawElement[]) => els.filter((e): e is TextElement => e.type === 'text');

// ===========================================================================
// 1. cartesian_axes
// ===========================================================================
describe('expandCartesianAxes', () => {
  const baseAxes: DrawElement = {
    id: 'axes-1',
    type: 'cartesian_axes',
    x: 100,
    y: 100,
    width: 400,
    height: 400,
    xRange: [-5, 5] as [number, number],
    yRange: [-5, 5] as [number, number],
  };

  it('produces arrows, tick lines, and tick labels', () => {
    const batch = lowerSingle(baseAxes);
    expect(batch.elements.length).toBeGreaterThan(0);
    expect(countByType(batch.elements, 'arrow')).toBe(2); // x-axis + y-axis
    expect(countByType(batch.elements, 'line')).toBeGreaterThanOrEqual(20); // ticks
    expect(countByType(batch.elements, 'text')).toBeGreaterThanOrEqual(20); // labels
  });

  it('x-axis arrow spans the full plot width (with ARROW_EXT) at the y=0 canvas position', () => {
    const batch = lowerSingle(baseAxes);
    const xAxis = batch.elements.find((e) => e.id === 'axes-1-x-axis') as ArrowElement;
    expect(xAxis).toBeDefined();
    // x-axis extends 6px beyond plot edges for clean arrow tips
    const EXT = 6;
    expect(xAxis.from.x).toBeCloseTo(100 - EXT);
    expect(xAxis.to.x).toBeCloseTo(500 + EXT);
    // y=0 maps to canvas y = 100 + 400 - ((0 - (-5)) / 10) * 400 = 300
    expect(xAxis.from.y).toBeCloseTo(300);
    expect(xAxis.to.y).toBeCloseTo(300);
  });

  it('y-axis arrow spans the full plot height (with ARROW_EXT) at the x=0 canvas position', () => {
    const batch = lowerSingle(baseAxes);
    const yAxis = batch.elements.find((e) => e.id === 'axes-1-y-axis') as ArrowElement;
    expect(yAxis).toBeDefined();
    const EXT = 6;
    // x=0 maps to canvas x = 100 + ((0 - (-5)) / 10) * 400 = 300
    expect(yAxis.from.x).toBeCloseTo(300);
    expect(yAxis.to.x).toBeCloseTo(300);
    // Y-axis goes from bottom+EXT to top-EXT
    expect(yAxis.from.y).toBeCloseTo(500 + EXT);
    expect(yAxis.to.y).toBeCloseTo(100 - EXT);
  });

  it('tick positions are within the plot area bounds', () => {
    const batch = lowerSingle(baseAxes);
    const tickLines = lines(batch.elements).filter((e) => e.id.includes('tick'));
    for (const tick of tickLines) {
      // All tick coordinates should be inside or near the plot area [100, 500]
      expect(tick.from.x).toBeGreaterThanOrEqual(92); // TICK_HALF margin
      expect(tick.from.x).toBeLessThanOrEqual(508);
      expect(tick.from.y).toBeGreaterThanOrEqual(92);
      expect(tick.from.y).toBeLessThanOrEqual(508);
    }
  });

  it('axis labels appear near arrowheads', () => {
    const elWithLabels: DrawElement = {
      ...baseAxes,
      id: 'axes-lbl',
      xLabel: 'x',
      yLabel: 'y',
    } as DrawElement;
    const batch = lowerSingle(elWithLabels);
    const xLabel = batch.elements.find((e) => e.id === 'axes-lbl-x-label') as TextElement;
    const yLabel = batch.elements.find((e) => e.id === 'axes-lbl-y-label') as TextElement;
    expect(xLabel).toBeDefined();
    expect(yLabel).toBeDefined();
    // x-label should be near the right end of the x-axis (past plot edge + ARROW_EXT)
    expect(xLabel.x).toBeGreaterThan(500);
    // y-label should be near the top of the y-axis
    expect(yLabel.y).toBeLessThan(100);
  });

  it('gridlines enabled produces vertical + horizontal grid lines', () => {
    const elWithGrid: DrawElement = {
      ...baseAxes,
      id: 'axes-grid',
      gridlines: true,
    } as DrawElement;
    const batch = lowerSingle(elWithGrid, 200);
    const gridLines = lines(batch.elements).filter((e) => e.id.includes('grid'));
    expect(gridLines.length).toBeGreaterThanOrEqual(10);
    // Vertical gridlines span full height
    const vGrid = gridLines.filter((e) => e.id.includes('xgrid'));
    for (const g of vGrid) {
      expect(g.from.y).toBeCloseTo(100);
      expect(g.to.y).toBeCloseTo(500);
    }
    // Horizontal gridlines span full width
    const hGrid = gridLines.filter((e) => e.id.includes('ygrid'));
    for (const g of hGrid) {
      expect(g.from.x).toBeCloseTo(100);
      expect(g.to.x).toBeCloseTo(500);
    }
  });

  it('returns empty for degenerate range (xSpan=0)', () => {
    const degenerate: DrawElement = {
      ...baseAxes,
      id: 'axes-degen',
      xRange: [5, 5] as [number, number],
    } as DrawElement;
    const batch = lowerSingle(degenerate);
    // Layout should be empty because span=0
    expect(batch.elements.length).toBe(0);
  });

  it('returns empty for inverted range', () => {
    const inverted: DrawElement = {
      ...baseAxes,
      id: 'axes-inv',
      xRange: [5, -5] as [number, number],
    } as DrawElement;
    const batch = lowerSingle(inverted);
    expect(batch.elements.length).toBe(0);
  });

  it('handles range not containing zero (axes clamped to edge)', () => {
    const positiveOnly: DrawElement = {
      id: 'axes-pos',
      type: 'cartesian_axes',
      x: 100,
      y: 100,
      width: 400,
      height: 400,
      xRange: [2, 10] as [number, number],
      yRange: [2, 10] as [number, number],
    };
    const batch = lowerSingle(positiveOnly);
    const xAxis = batch.elements.find((e) => e.id === 'axes-pos-x-axis') as ArrowElement;
    const yAxis = batch.elements.find((e) => e.id === 'axes-pos-y-axis') as ArrowElement;
    expect(xAxis).toBeDefined();
    expect(yAxis).toBeDefined();
    const EXT = 6;
    // 0 is below the yRange [2,10], so y-axis x should be clamped to toCanvasX(2) = left edge
    expect(xAxis.from.x).toBeCloseTo(100 - EXT);
    // 0 is below the xRange [2,10], so x-axis y should be clamped to toCanvasY(2) = bottom edge
    expect(xAxis.from.y).toBeCloseTo(500);
  });
});

// ===========================================================================
// 2. number_line
// ===========================================================================
describe('expandNumberLine', () => {
  const baseLine: DrawElement = {
    id: 'nline-1',
    type: 'number_line',
    x: 100,
    y: 300,
    length: 600,
    min: -3,
    max: 3,
  };

  it('produces 1 arrow, 7+ ticks, 7+ labels', () => {
    const batch = lowerSingle(baseLine);
    expect(countByType(batch.elements, 'arrow')).toBe(1);
    expect(countByType(batch.elements, 'line')).toBeGreaterThanOrEqual(7);
    expect(countByType(batch.elements, 'text')).toBeGreaterThanOrEqual(7);
  });

  it('main arrow spans full length (with ARROW_EXT)', () => {
    const batch = lowerSingle(baseLine);
    const axis = arrows(batch.elements).find((e) => e.id === 'nline-1-axis')!;
    const EXT = 6;
    expect(axis.from.x).toBeCloseTo(100 - EXT);
    expect(axis.to.x).toBeCloseTo(700 + EXT);
    expect(axis.from.y).toBeCloseTo(300);
    expect(axis.to.y).toBeCloseTo(300);
  });

  it('tick at value 0 maps to the center', () => {
    const batch = lowerSingle(baseLine);
    // scale = 600/6 = 100, tick at 0 → x = 100 + (0-(-3))*100 = 400
    const tickZero = lines(batch.elements).find(
      (e) => e.id.includes('tick') && e.from.x >= 399 && e.from.x <= 401,
    );
    expect(tickZero).toBeDefined();
  });

  it('with label, includes a centered text element above the line', () => {
    const elWithLabel: DrawElement = { ...baseLine, id: 'nline-lbl', label: 'Real Numbers' } as DrawElement;
    const batch = lowerSingle(elWithLabel);
    const lbl = texts(batch.elements).find((e) => e.id === 'nline-lbl-label') as TextElement;
    expect(lbl).toBeDefined();
    expect(lbl.text).toBe('Real Numbers');
    // centered above the line
    expect(lbl.x).toBeCloseTo(400); // x + length/2
    expect(lbl.y).toBeLessThan(300);
  });

  it('returns empty for zero-length span', () => {
    const zeroSpan: DrawElement = { ...baseLine, id: 'nline-zero', min: 5, max: 5 } as DrawElement;
    const batch = lowerSingle(zeroSpan);
    expect(batch.elements.length).toBe(0);
  });

  it('returns empty for inverted range', () => {
    const inv: DrawElement = { ...baseLine, id: 'nline-inv', min: 5, max: -5 } as DrawElement;
    const batch = lowerSingle(inv);
    expect(batch.elements.length).toBe(0);
  });
});

// ===========================================================================
// 3. vector_arrow
// ===========================================================================
describe('expandVectorArrow', () => {
  const baseVec: DrawElement = {
    id: 'vec-1',
    type: 'vector_arrow',
    x: 200,
    y: 300,
    dx: 200,
    dy: -100,
  };

  it('produces a shaft line + 2 arrowhead lines', () => {
    const batch = lowerSingle(baseVec);
    expect(countByType(batch.elements, 'line')).toBe(3);
  });

  it('shaft goes from tail to tip', () => {
    const batch = lowerSingle(baseVec);
    const shaft = lines(batch.elements).find((e) => e.id === 'vec-1-shaft')!;
    expect(shaft.from.x).toBeCloseTo(200);
    expect(shaft.from.y).toBeCloseTo(300);
    expect(shaft.to.x).toBeCloseTo(400);
    expect(shaft.to.y).toBeCloseTo(200);
  });

  it('arrowhead points are behind the tip', () => {
    const batch = lowerSingle(baseVec);
    const headL = lines(batch.elements).find((e) => e.id === 'vec-1-head-l')!;
    const headR = lines(batch.elements).find((e) => e.id === 'vec-1-head-r')!;
    // Both head lines start at the tip (400, 200)
    expect(headL.from.x).toBeCloseTo(400);
    expect(headL.from.y).toBeCloseTo(200);
    expect(headR.from.x).toBeCloseTo(400);
    expect(headR.from.y).toBeCloseTo(200);
    // Wing-tip endpoints should be behind the tip (closer to 200,300)
    expect(headL.to.x).toBeLessThan(400);
    expect(headR.to.x).toBeLessThan(400);
  });

  it('label appears at the midpoint', () => {
    const withLabel: DrawElement = { ...baseVec, id: 'vec-lbl', label: 'v⃗' } as DrawElement;
    const batch = lowerSingle(withLabel);
    const lbl = texts(batch.elements).find((e) => e.id === 'vec-lbl-label')!;
    expect(lbl).toBeDefined();
    expect(lbl.text).toBe('v⃗');
    // Near midpoint (300 + 8, 250 - 8)
    expect(lbl.x).toBeCloseTo(308);
    expect(lbl.y).toBeCloseTo(242);
  });

  it('returns empty for near-zero length vector', () => {
    const tiny: DrawElement = { ...baseVec, id: 'vec-tiny', dx: 0.1, dy: 0.1 } as DrawElement;
    const batch = lowerSingle(tiny);
    expect(batch.elements.length).toBe(0);
  });
});

// ===========================================================================
// 4. function_curve
// ===========================================================================
describe('expandFunctionCurve', () => {
  // sin(x) with 50 pre-sampled points
  const sinPoints = Array.from({ length: 51 }, (_, i) => {
    const x = (i / 50) * 2 * Math.PI;
    return { x, y: Math.sin(x) };
  });

  const baseCurve: DrawElement = {
    id: 'fcurve-1',
    type: 'function_curve',
    x: 100,
    y: 100,
    width: 400,
    height: 200,
    xRange: [0, 2 * Math.PI] as [number, number],
    yRange: [-1, 1] as [number, number],
    points: sinPoints,
  };

  it('produces 50 line segments from 51 points', () => {
    const batch = lowerSingle(baseCurve);
    expect(countByType(batch.elements, 'line')).toBe(50);
  });

  it('all line segments are within the canvas plot area', () => {
    const batch = lowerSingle(baseCurve);
    for (const el of lines(batch.elements)) {
      expect(el.from.x).toBeGreaterThanOrEqual(99);
      expect(el.from.x).toBeLessThanOrEqual(501);
      expect(el.from.y).toBeGreaterThanOrEqual(99);
      expect(el.from.y).toBeLessThanOrEqual(301);
      expect(el.to.x).toBeGreaterThanOrEqual(99);
      expect(el.to.x).toBeLessThanOrEqual(501);
    }
  });

  it('expression-based curve evaluates correctly', () => {
    const exprCurve: DrawElement = {
      id: 'fcurve-expr',
      type: 'function_curve',
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      xRange: [0, 6.28] as [number, number],
      yRange: [-1, 1] as [number, number],
      expression: 'Math.sin(x)',
    };
    const batch = lowerSingle(exprCurve);
    // 80 sample points → 79 line segments
    expect(countByType(batch.elements, 'line')).toBe(79);
  });

  it('handles NaN-producing expressions (splits at discontinuities)', () => {
    const nanCurve: DrawElement = {
      id: 'fcurve-nan',
      type: 'function_curve',
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      xRange: [-2, 2] as [number, number],
      yRange: [-5, 5] as [number, number],
      expression: 'Math.log(x)',
    };
    const batch = lowerSingle(nanCurve);
    // Should still produce some segments (for x > 0)
    expect(countByType(batch.elements, 'line')).toBeGreaterThan(0);
    // All outputs must be finite
    for (const el of lines(batch.elements)) {
      expect(Number.isFinite(el.from.x)).toBe(true);
      expect(Number.isFinite(el.from.y)).toBe(true);
      expect(Number.isFinite(el.to.x)).toBe(true);
      expect(Number.isFinite(el.to.y)).toBe(true);
    }
  });

  it('handles Infinity-producing expressions gracefully', () => {
    const infCurve: DrawElement = {
      id: 'fcurve-inf',
      type: 'function_curve',
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      xRange: [-2, 2] as [number, number],
      yRange: [-10, 10] as [number, number],
      expression: '1/x',
    };
    const batch = lowerSingle(infCurve);
    for (const el of lines(batch.elements)) {
      expect(Number.isFinite(el.from.x)).toBe(true);
      expect(Number.isFinite(el.to.x)).toBe(true);
    }
  });

  it('returns empty for fewer than 2 points', () => {
    const onePoint: DrawElement = {
      ...baseCurve,
      id: 'fcurve-1pt',
      points: [{ x: 1, y: 1 }],
    } as DrawElement;
    const batch = lowerSingle(onePoint);
    expect(batch.elements.length).toBe(0);
  });

  it('returns empty for no points and no expression', () => {
    const noData: DrawElement = {
      id: 'fcurve-nodata',
      type: 'function_curve',
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      xRange: [0, 10] as [number, number],
      yRange: [-1, 1] as [number, number],
    };
    const batch = lowerSingle(noData);
    expect(batch.elements.length).toBe(0);
  });

  it('label appears when specified', () => {
    const withLabel: DrawElement = { ...baseCurve, id: 'fcurve-lbl', label: 'y = sin(x)' } as DrawElement;
    const batch = lowerSingle(withLabel);
    const lbl = texts(batch.elements).find((e) => e.id === 'fcurve-lbl-label')!;
    expect(lbl).toBeDefined();
    expect(lbl.text).toBe('y = sin(x)');
  });
});

// ===========================================================================
// 5. angle_arc
// ===========================================================================
describe('expandAngleArc', () => {
  const baseArc: DrawElement = {
    id: 'arc-1',
    type: 'angle_arc',
    x: 300,
    y: 300,
    radius: 40,
    startAngle: 0,
    endAngle: 90,
  };

  it('produces 16+ line segments for the arc', () => {
    const batch = lowerSingle(baseArc);
    expect(countByType(batch.elements, 'line')).toBeGreaterThanOrEqual(16);
  });

  it('all arc segments radiate from near the vertex', () => {
    const batch = lowerSingle(baseArc);
    for (const seg of lines(batch.elements)) {
      // Each segment endpoint should be approximately radius distance from the vertex
      const d1 = Math.hypot(seg.from.x - 300, seg.from.y - 300);
      const d2 = Math.hypot(seg.to.x - 300, seg.to.y - 300);
      expect(d1).toBeCloseTo(40, 0);
      expect(d2).toBeCloseTo(40, 0);
    }
  });

  it('label appears at mid-angle when specified', () => {
    const withLabel: DrawElement = { ...baseArc, id: 'arc-lbl', label: '90°' } as DrawElement;
    const batch = lowerSingle(withLabel);
    const lbl = texts(batch.elements).find((e) => e.id === 'arc-lbl-label')!;
    expect(lbl).toBeDefined();
    expect(lbl.text).toBe('90°');
    // Label should be at radius * 1.3 from the vertex at midAngle=45°
    const dist = Math.hypot(lbl.x - 300, lbl.y - 300);
    expect(dist).toBeCloseTo(52, 0); // 40 * 1.3
  });

  it('handles 360° full circle', () => {
    const fullCircle: DrawElement = { ...baseArc, id: 'arc-full', startAngle: 0, endAngle: 360 } as DrawElement;
    const batch = lowerSingle(fullCircle);
    // Should produce many segments for a full circle
    expect(countByType(batch.elements, 'line')).toBeGreaterThanOrEqual(16);
  });
});

// ===========================================================================
// 6. integral_region
// ===========================================================================
describe('expandIntegralRegion', () => {
  const topPts = Array.from({ length: 10 }, (_, i) => {
    const x = i / 9;
    return { x, y: x * x }; // y = x^2 over [0, 1]
  });

  const baseIntegral: DrawElement = {
    id: 'integ-1',
    type: 'integral_region',
    x: 100,
    y: 100,
    width: 400,
    height: 300,
    xRange: [0, 1] as [number, number],
    yRange: [0, 1] as [number, number],
    topPoints: topPts,
  };

  it('produces fill lines, top boundary, bottom boundary, and vertical edges', () => {
    const batch = lowerSingle(baseIntegral, 200);
    const allLines = lines(batch.elements);
    expect(allLines.length).toBeGreaterThan(0);
    // Check for boundary segments
    const topSegs = allLines.filter((e) => e.id.includes('top'));
    const botSegs = allLines.filter((e) => e.id.includes('bot'));
    const edges = allLines.filter((e) => e.id.includes('edge'));
    expect(topSegs.length).toBe(9); // 10 points → 9 segments
    expect(botSegs.length).toBe(9);
    expect(edges.length).toBe(2); // left + right edge
  });

  it('label appears when specified', () => {
    const withLabel: DrawElement = {
      ...baseIntegral,
      id: 'integ-lbl',
      label: '∫₀¹ x² dx',
    } as DrawElement;
    const batch = lowerSingle(withLabel, 200);
    const lbl = texts(batch.elements).find((e) => e.id === 'integ-lbl-label')!;
    expect(lbl).toBeDefined();
    expect(lbl.text).toBe('∫₀¹ x² dx');
  });

  it('uses y=0 baseline when bottomPoints is absent', () => {
    const batch = lowerSingle(baseIntegral, 200);
    const botSegs = lines(batch.elements).filter((e) => e.id.includes('bot'));
    // All bottom boundary segments should be at toCanvasY(0) = y + height = 400
    for (const seg of botSegs) {
      expect(seg.from.y).toBeCloseTo(400);
      expect(seg.to.y).toBeCloseTo(400);
    }
  });
});

// ===========================================================================
// 7. matrix_bracket (passed through, not expanded by lowerer)
// ===========================================================================
describe('matrix_bracket passthrough', () => {
  it('matrix_bracket elements pass through the lowerer unchanged', () => {
    const matrix: DrawElement = {
      id: 'mat-1',
      type: 'matrix_bracket',
      x: 100,
      y: 100,
      rows: [
        ['1', '0'],
        ['0', '1'],
      ],
      bracketStyle: '[]',
    };
    const batch = lowerSingle(matrix);
    expect(batch.elements.length).toBe(1);
    expect(batch.elements[0].type).toBe('matrix_bracket');
  });
});

// ===========================================================================
// 8. lowerMathPrimitive export
// ===========================================================================
describe('lowerMathPrimitive', () => {
  it('handles cartesian_axes', () => {
    const result = lowerMathPrimitive({
      id: 'lmp-axes',
      type: 'cartesian_axes',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      xRange: [-1, 1],
      yRange: [-1, 1],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((e) => e.type === 'arrow')).toBe(true);
  });

  it('handles number_line', () => {
    const result = lowerMathPrimitive({
      id: 'lmp-nline',
      type: 'number_line',
      x: 0,
      y: 0,
      length: 200,
      min: 0,
      max: 10,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((e) => e.type === 'arrow')).toBe(true);
  });

  it('handles vector_arrow', () => {
    const result = lowerMathPrimitive({
      id: 'lmp-vec',
      type: 'vector_arrow',
      x: 0,
      y: 0,
      dx: 100,
      dy: 50,
    });
    expect(result.length).toBe(3); // shaft + 2 head lines
  });
});

// ===========================================================================
// 9. Full pipeline integration
// ===========================================================================
describe('full pipeline integration', () => {
  it('mixed math primitives + basic elements lower without crash', () => {
    const elements: DrawElement[] = [
      {
        id: 'bg-rect',
        type: 'rect',
        x: 0,
        y: 0,
        w: 800,
        h: 600,
        color: '#ffffff',
      },
      {
        id: 'axes-int',
        type: 'cartesian_axes',
        x: 50,
        y: 50,
        width: 300,
        height: 300,
        xRange: [-5, 5] as [number, number],
        yRange: [-5, 5] as [number, number],
      },
      {
        id: 'nline-int',
        type: 'number_line',
        x: 50,
        y: 450,
        length: 400,
        min: -10,
        max: 10,
      },
      {
        id: 'vec-int',
        type: 'vector_arrow',
        x: 500,
        y: 300,
        dx: 100,
        dy: -80,
        label: 'F',
      },
      {
        id: 'label-1',
        type: 'text',
        x: 400,
        y: 50,
        text: 'Math Drawing',
        size: 20,
      },
    ];
    const layout = makeLayout(elements);
    const batch = lowerPlannedLayoutToDrawBatch(layout, { maxElements: 200 });
    expect(batch.elements.length).toBeGreaterThan(5);
    // All lowered elements should be basic primitives (no composite types remain)
    for (const el of batch.elements) {
      expect(['rect', 'ellipse', 'line', 'arrow', 'text', 'latex', 'matrix_bracket']).toContain(el.type);
    }
  });

  it('element count capping works and produces a warning', () => {
    const elements: DrawElement[] = [
      {
        id: 'axes-cap',
        type: 'cartesian_axes',
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        xRange: [-10, 10] as [number, number],
        yRange: [-10, 10] as [number, number],
        gridlines: true,
      },
    ];
    const layout = makeLayout(elements);
    const batch = lowerPlannedLayoutToDrawBatch(layout, { maxElements: 10 });
    expect(batch.elements.length).toBeLessThanOrEqual(10);
    expect(layout.warnings).toContain('element_count_capped');
  });

  it('deduplication keeps last occurrence', () => {
    const elements: DrawElement[] = [
      { id: 'dup-1', type: 'text', x: 10, y: 10, text: 'first', size: 12 },
      { id: 'dup-1', type: 'text', x: 20, y: 20, text: 'second', size: 14 },
    ];
    const layout = makeLayout(elements);
    const batch = lowerPlannedLayoutToDrawBatch(layout);
    expect(batch.elements.length).toBe(1);
    expect((batch.elements[0] as TextElement).text).toBe('second');
  });

  it('draw order sorts shapes before lines before text', () => {
    const elements: DrawElement[] = [
      { id: 'txt', type: 'text', x: 10, y: 10, text: 'hello', size: 12 },
      { id: 'ln', type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 100 } },
      { id: 'rct', type: 'rect', x: 10, y: 10, w: 50, h: 50 },
    ];
    const layout = makeLayout(elements);
    const batch = lowerPlannedLayoutToDrawBatch(layout);
    const types = batch.elements.map((e) => e.type);
    expect(types.indexOf('rect')).toBeLessThan(types.indexOf('line'));
    expect(types.indexOf('line')).toBeLessThan(types.indexOf('text'));
  });
});

// ===========================================================================
// 10. Mathematical accuracy — specific geometry checks
// ===========================================================================
describe('mathematical accuracy', () => {
  it('cartesian_axes at x=100,y=100,400×400,[-5,5]×[-5,5] geometry', () => {
    const el: DrawElement = {
      id: 'acc-axes',
      type: 'cartesian_axes',
      x: 100,
      y: 100,
      width: 400,
      height: 400,
      xRange: [-5, 5] as [number, number],
      yRange: [-5, 5] as [number, number],
    };
    const batch = lowerSingle(el);

    // 2 arrows
    expect(countByType(batch.elements, 'arrow')).toBe(2);

    // tick marks: tickMarksForRange(-5,5,10) produces values at -5,-4,-3,-2,-1,0,1,2,3,4,5
    // 0 is skipped → 10 ticks per axis → 20 tick lines + 20 tick labels
    const tickLines = lines(batch.elements).filter((e) => e.id.includes('tick'));
    expect(tickLines.length).toBeGreaterThanOrEqual(20);
    const tickLabels = texts(batch.elements).filter((e) => e.id.includes('tlbl'));
    expect(tickLabels.length).toBeGreaterThanOrEqual(20);

    // Verify a specific tick position: value 3 on x-axis
    // toCanvasX(3) = 100 + ((3 - (-5))/10)*400 = 100 + 320 = 420
    const xTick3 = tickLines.find(
      (e) => e.id.includes('xtick') && Math.abs(e.from.x - 420) < 1,
    );
    expect(xTick3).toBeDefined();

    // Verify a specific tick position: value -2 on y-axis
    // toCanvasY(-2) = 100 + 400 - ((-2-(-5))/10)*400 = 500 - 120 = 380
    const yTick = tickLines.find(
      (e) => e.id.includes('ytick') && Math.abs(e.from.y - 380) < 1,
    );
    expect(yTick).toBeDefined();
  });

  it('number_line at x=100,y=300,length=600,min=-3,max=3 geometry', () => {
    const el: DrawElement = {
      id: 'acc-nline',
      type: 'number_line',
      x: 100,
      y: 300,
      length: 600,
      min: -3,
      max: 3,
    };
    const batch = lowerSingle(el);

    // 1 main line (arrow)
    expect(countByType(batch.elements, 'arrow')).toBe(1);

    // ticks: tickMarksForRange(-3,3,10) → values at -3,-2,-1,0,1,2,3 = 7 ticks
    const tickLines = lines(batch.elements).filter((e) => e.id.includes('tick'));
    expect(tickLines.length).toBeGreaterThanOrEqual(7);
    const tickLabels = texts(batch.elements).filter((e) => e.id.includes('tlbl'));
    expect(tickLabels.length).toBeGreaterThanOrEqual(7);

    // Verify tick at value 2: sx = 100 + (2-(-3))*100 = 600
    const tick2 = tickLines.find(
      (e) => Math.abs(e.from.x - 600) < 1,
    );
    expect(tick2).toBeDefined();
  });

  it('vector_arrow from (200,300) to (400,200) geometry', () => {
    const el: DrawElement = {
      id: 'acc-vec',
      type: 'vector_arrow',
      x: 200,
      y: 300,
      dx: 200,
      dy: -100,
      label: 'v',
    };
    const batch = lowerSingle(el);

    // 3 lines (shaft + 2 head) + 1 text label
    expect(countByType(batch.elements, 'line')).toBe(3);
    expect(countByType(batch.elements, 'text')).toBe(1);

    const shaft = lines(batch.elements).find((e) => e.id === 'acc-vec-shaft')!;
    expect(shaft.from).toEqual({ x: 200, y: 300 });
    expect(shaft.to).toEqual({ x: 400, y: 200 });

    // Length = hypot(200, -100) ≈ 223.6
    const len = Math.hypot(200, -100);
    expect(len).toBeCloseTo(223.6, 0);
  });

  it('function_curve sin(x) with 51 points over [0,6.28] produces 50 segments', () => {
    const points = Array.from({ length: 51 }, (_, i) => {
      const x = (i / 50) * 6.28;
      return { x, y: Math.sin(x) };
    });
    const el: DrawElement = {
      id: 'acc-fcurve',
      type: 'function_curve',
      x: 0,
      y: 0,
      width: 600,
      height: 200,
      xRange: [0, 6.28] as [number, number],
      yRange: [-1, 1] as [number, number],
      points,
    };
    const batch = lowerSingle(el);
    // 51 points → 50 segments (sin is smooth, no discontinuities)
    expect(countByType(batch.elements, 'line')).toBe(50);

    // First segment should start at toCanvasX(0) = 0, toCanvasY(sin(0)) = 0 + 200 - 100 = 100
    const firstSeg = lines(batch.elements)[0]!;
    expect(firstSeg.from.x).toBeCloseTo(0);
    expect(firstSeg.from.y).toBeCloseTo(100); // sin(0)=0 → middle of [0, 200]
  });
});
