import type {
  DrawBatch,
  DrawElement,
  CartesianAxesElement,
  NumberLineElement,
  VectorArrowElement,
  FunctionCurveElement,
  ParametricCurveElement,
  PolarPlotElement,
  AngleArcElement,
  IntegralRegionElement,
  CircleWithRadiusElement,
  TriangleWithAnglesElement,
  MatrixBracketElement,
  LinearTransformElement,
  HistogramElement,
  NormalDistributionCurveElement,
  RiemannSumElement,
  TangentLineElement,
  SlopeFieldElement,
  VectorField2dElement,
  Wireframe3dElement,
  SequencePlotElement,
  BezierCurveElement,
  ComplexPlaneElement,
  NumberTheoryGridElement,
  ConicSectionElement,
  CoordinateGridElement,
  PolygonElement,
  GeometricConstructionElement,
  ProbabilityTreeElement,
  ScatterPlotElement,
  AnnotationArrowElement,
  FormulaBoxElement,
  VennDiagramElement,
  TruthTableElement,
  SymbolGridElement,
  EquationSystemElement,
  ComparisonChartElement,
  BoxPlotElement,
  IntervalDiagramElement,
  Point,
} from '@/types/agent';
import { assertNeverDrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from './types';
import type { PlannerTraceContext } from './trace';
import { boundsOf } from './bounds';
import { tickMarksForRange, computeArrowHead, formatTickLabel, toLatex } from '../math-sampling';
import { parseMathExpression, parseMathExpression2Var } from '../graph-script';
import type { ColorTheme } from '../color-theme';
import { getCurveColor, getThemeColors } from '../color-theme';

export const DEFAULT_MAX_LOWERED_ELEMENTS = 500;

// ---------------------------------------------------------------------------
// Grid-snap utility for blueprint-style layouts
// ---------------------------------------------------------------------------

/** Round a value to the nearest multiple of `gridSize`. */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Returns true when a string contains LaTeX-like markup (`\`, `^`, `_`, `{`, `}`). */
export function shouldUseLaTeX(str: string): boolean {
  return /[\\^_{}]/.test(str);
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/** Convert a hex color like "#4a90d9" to an 8-digit hex with the given alpha (0–1). */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `#${h.substring(0, 6)}${alphaHex}`;
}

// ---------------------------------------------------------------------------
// Shared coordinate mapping utilities
// ---------------------------------------------------------------------------

export interface CanvasRect { x: number; y: number; width: number; height: number; }
export interface MathRange { xMin: number; xMax: number; yMin: number; yMax: number; }

export function makeCoordMapper(rect: CanvasRect, range: MathRange) {
  const { x, y, width, height } = rect;
  const { xMin, xMax, yMin, yMax } = range;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  return {
    toCanvasX: (mx: number) => x + (mx - xMin) / xSpan * width,
    toCanvasY: (my: number) => y + height - (my - yMin) / ySpan * height,
    toMathX: (cx: number) => xMin + (cx - x) / width * xSpan,
    toMathY: (cy: number) => yMin + (y + height - cy) / height * ySpan,
  };
}

function drawOrderPriority(el: DrawElement): number {
  switch (el.type) {
    case 'rect':
    case 'ellipse':
      return 0;
    case 'line':
    case 'arrow':
      return 1;
    case 'text':
    case 'latex':
      return 2;
    case 'clear':
      return 3;
    case 'cartesian_axes':
    case 'number_line':
    case 'vector_arrow':
    case 'function_curve':
    case 'angle_arc':
    case 'integral_region':
    case 'matrix_bracket':
    case 'linear_transform':
    case 'circle_with_radius':
    case 'triangle_with_angles':
    case 'parametric_curve':
    case 'polar_plot':
    case 'histogram':
    case 'normal_distribution':
    case 'riemann_sum':
    case 'tangent_line':
    case 'slope_field':
    case 'vector_field_2d':
    case 'wireframe_3d':
    case 'sequence_plot':
    case 'bezier_curve':
    case 'complex_plane':
    case 'number_theory_grid':
    case 'annotation_arrow':
    case 'formula_box':
    case 'venn_diagram':
    case 'truth_table':
    case 'symbol_grid':
    case 'equation_system':
    case 'conic_section':
    case 'coordinate_grid':
    case 'comparison_chart':
    case 'box_plot':
    case 'probability_tree':
    case 'scatter_plot':
    case 'polygon':
    case 'geometric_construction':
    case 'interval_diagram':
      return 0; // math primitives render at shape level
    default:
      // Exhaustive check — compile-time error when a new DrawElement variant is added.
      assertNeverDrawElement(el);
  }
}

// ---------------------------------------------------------------------------
// Expansion helpers: lower high-level math primitives to basic DrawElements
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;

function expandAngleArc(el: AngleArcElement): DrawElement[] {
  const result: DrawElement[] = [];
  const startRad = el.startAngle * DEG_TO_RAD;
  const endRad = el.endAngle * DEG_TO_RAD;
  const steps = Math.max(16, Math.ceil(Math.abs(endRad - startRad) / (Math.PI / 36)));

  // Build arc as a series of short line segments
  for (let i = 0; i < steps; i++) {
    const t0 = startRad + ((endRad - startRad) * i) / steps;
    const t1 = startRad + ((endRad - startRad) * (i + 1)) / steps;
    result.push({
      id: `${el.id}-arc-${i}`,
      type: 'line',
      from: {
        x: el.x + el.radius * Math.cos(t0),
        y: el.y - el.radius * Math.sin(t0),
      },
      to: {
        x: el.x + el.radius * Math.cos(t1),
        y: el.y - el.radius * Math.sin(t1),
      },
      color: el.color,
      stroke_width: el.stroke_width,
    });
  }

  // Label at midAngle, positioned at radius * 1.3 from vertex
  if (el.label) {
    const midRad = (startRad + endRad) / 2;
    const labelR = el.radius * 1.4;
    const lx = el.x + labelR * Math.cos(midRad);
    const ly = el.y - labelR * Math.sin(midRad);
    if (shouldUseLaTeX(el.label)) {
      result.push({
        id: `${el.id}-label`,
        type: 'latex',
        x: lx,
        y: ly,
        tex: el.label,
        fontSize: 14,
        displayMode: false,
      });
    } else {
      result.push({
        id: `${el.id}-label`,
        type: 'text',
        x: lx,
        y: ly,
        text: el.label,
        size: 14,
        color: el.color,
      });
    }
  }

  return result;
}

function expandIntegralRegion(el: IntegralRegionElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const strokeColor = el.strokeColor ?? el.color ?? '#1f2a44';
  const fillColor = el.fillColor ?? 'rgba(100,149,237,0.3)';
  const fillOpacity = el.fillOpacity ?? 0.3;

  const [a, b] = el.xRange;
  const [yMin, yMax] = el.yRange;

  const mapper = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin: a, xMax: b, yMin, yMax },
  );
  const { toCanvasX, toCanvasY } = mapper;

  // ---------------------------------------------------------------------------
  // Build top-boundary points from expression, provided points, or topPoints
  // ---------------------------------------------------------------------------
  let topPoints: Array<{ x: number; y: number }> = [];
  if (el.expression) {
    const parsedFn = parseMathExpression(el.expression);
    if (parsedFn) {
      const steps = 80;
      const dx = (b - a) / (steps - 1);
      for (let i = 0; i < steps; i++) {
        const mx = a + i * dx;
        try { topPoints.push({ x: mx, y: parsedFn(mx) }); } catch { topPoints.push({ x: mx, y: 0 }); }
      }
    }
  }
  if (topPoints.length === 0 && el.topPoints && el.topPoints.length > 0) {
    topPoints = el.topPoints;
  }
  if (topPoints.length === 0) return result;

  const bottomY = 0;
  const canvasBaseY = toCanvasY(bottomY);

  // ---------------------------------------------------------------------------
  // 1. Many short vertical fill lines (shaded region)
  // ---------------------------------------------------------------------------
  const FILL_DENSITY = 2;
  const canvasA = toCanvasX(a);
  const canvasB = toCanvasX(b);
  const fillSteps = Math.min(100, Math.max(1, Math.ceil(Math.abs(canvasB - canvasA) / FILL_DENSITY)));

  function interpolateTop(mx: number): number {
    if (topPoints.length === 0) return 0;
    if (mx <= topPoints[0]!.x) return topPoints[0]!.y;
    if (mx >= topPoints[topPoints.length - 1]!.x) return topPoints[topPoints.length - 1]!.y;
    for (let j = 0; j < topPoints.length - 1; j++) {
      const p0 = topPoints[j]!;
      const p1 = topPoints[j + 1]!;
      if (mx >= p0.x && mx <= p1.x) {
        const t = (mx - p0.x) / (p1.x - p0.x || 1);
        return p0.y + t * (p1.y - p0.y);
      }
    }
    return 0;
  }

  const opaqueColor = fillColor.startsWith('rgba')
    ? fillColor
    : fillColor.startsWith('#')
      ? `rgba(${parseInt(fillColor.slice(1, 3), 16)},${parseInt(fillColor.slice(3, 5), 16)},${parseInt(fillColor.slice(5, 7), 16)},${fillOpacity})`
      : `rgba(100,149,237,${fillOpacity})`;

  for (let i = 0; i <= fillSteps; i++) {
    const cx = canvasA + (canvasB - canvasA) * i / fillSteps;
    const mx = a + (b - a) * i / fillSteps;
    const my = interpolateTop(mx);
    const cy = toCanvasY(my);
    result.push({
      id: `${el.id}-fill-${i}`,
      type: 'line',
      from: { x: cx, y: canvasBaseY },
      to: { x: cx, y: cy },
      color: opaqueColor,
      stroke_width: FILL_DENSITY,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Top boundary curve (the function) drawn on top of the fill
  // ---------------------------------------------------------------------------
  const topCanvas = topPoints.map((p) => ({ x: toCanvasX(p.x), y: toCanvasY(p.y) }));
  for (let i = 0; i < topCanvas.length - 1; i++) {
    result.push({
      id: `${el.id}-top-${i}`,
      type: 'line',
      from: topCanvas[i]!,
      to: topCanvas[i + 1]!,
      color: strokeColor,
      stroke_width: el.stroke_width ?? 1.8,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Left vertical line at x = a
  // ---------------------------------------------------------------------------
  result.push({
    id: `${el.id}-left-edge`,
    type: 'line',
    from: { x: toCanvasX(a), y: toCanvasY(interpolateTop(a)) },
    to: { x: toCanvasX(a), y: canvasBaseY },
    color: strokeColor,
    stroke_width: el.stroke_width,
  });

  // ---------------------------------------------------------------------------
  // 4. Right vertical line at x = b
  // ---------------------------------------------------------------------------
  result.push({
    id: `${el.id}-right-edge`,
    type: 'line',
    from: { x: toCanvasX(b), y: toCanvasY(interpolateTop(b)) },
    to: { x: toCanvasX(b), y: canvasBaseY },
    color: strokeColor,
    stroke_width: el.stroke_width,
  });

  // ---------------------------------------------------------------------------
  // 5. Bottom line along x-axis from a to b
  // ---------------------------------------------------------------------------
  result.push({
    id: `${el.id}-bottom`,
    type: 'line',
    from: { x: toCanvasX(a), y: canvasBaseY },
    to: { x: toCanvasX(b), y: canvasBaseY },
    color: strokeColor,
    stroke_width: el.stroke_width,
  });

  // ---------------------------------------------------------------------------
  // 6 & 7. Tick marks and labels at a and b
  // ---------------------------------------------------------------------------
  const TICK_HALF = 5;
  const aLabel = el.aLabel ?? 'a';
  const bLabel = el.bLabel ?? 'b';

  result.push({
    id: `${el.id}-tick-a`,
    type: 'line',
    from: { x: toCanvasX(a), y: canvasBaseY - TICK_HALF },
    to: { x: toCanvasX(a), y: canvasBaseY + TICK_HALF },
    color: strokeColor,
    stroke_width: el.stroke_width,
  });
  if (shouldUseLaTeX(aLabel)) {
    result.push({
      id: `${el.id}-label-a`,
      type: 'latex' as const,
      x: toCanvasX(a),
      y: canvasBaseY + TICK_HALF + 14,
      tex: aLabel,
      fontSize: 14,
      displayMode: false,
    });
  } else {
    result.push({
      id: `${el.id}-label-a`,
      type: 'text' as const,
      x: toCanvasX(a),
      y: canvasBaseY + TICK_HALF + 14,
      text: aLabel,
      size: 14,
      color: strokeColor,
    });
  }

  result.push({
    id: `${el.id}-tick-b`,
    type: 'line',
    from: { x: toCanvasX(b), y: canvasBaseY - TICK_HALF },
    to: { x: toCanvasX(b), y: canvasBaseY + TICK_HALF },
    color: strokeColor,
    stroke_width: el.stroke_width,
  });
  if (shouldUseLaTeX(bLabel)) {
    result.push({
      id: `${el.id}-label-b`,
      type: 'latex' as const,
      x: toCanvasX(b),
      y: canvasBaseY + TICK_HALF + 14,
      tex: bLabel,
      fontSize: 14,
      displayMode: false,
    });
  } else {
    result.push({
      id: `${el.id}-label-b`,
      type: 'text',
      x: toCanvasX(b),
      y: canvasBaseY + TICK_HALF + 14,
      text: bLabel,
      size: 14,
      color: strokeColor,
    });
  }

  // Optional centered label
  if (el.label) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    if (shouldUseLaTeX(el.label)) {
      result.push({
        id: `${el.id}-label`,
        type: 'latex' as const,
        x: cx,
        y: cy,
        tex: el.label,
        fontSize: 14,
        displayMode: false,
      });
    } else {
      result.push({
        id: `${el.id}-label`,
        type: 'text',
        x: cx,
        y: cy,
        text: el.label,
        size: 14,
        color: strokeColor,
      });
    }
  }

  return result;
}

function expandFunctionCurve(el: FunctionCurveElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const [xMin, xMax] = el.xRange;
  const [yMin, yMax] = el.yRange;
  const curveColor = el.color ?? '#1f2a44';

  // Use thinner stroke for mathematical/blueprint styles
  const isMathStyle = el.style === 'mathematical' || el.style === 'blueprint_neat';
  const curveWidth = el.stroke_width ?? (isMathStyle ? 1.5 : 1.8);

  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin, xMax, yMin, yMax },
  );

  // Build raw points from pre-sampled data or expression evaluation
  let rawPoints: Array<{ x: number; y: number }> = [];
  if (el.points && el.points.length > 0) {
    rawPoints = el.points;
  } else if (el.expression) {
    const steps = 160;
    const dx = (xMax - xMin) / (steps - 1);
    // Try safe custom parser first, fall back to Function constructor for Math.* expressions
    const parsedFn = parseMathExpression(el.expression);
    if (parsedFn) {
      for (let i = 0; i < steps; i++) {
        const x = xMin + i * dx;
        try { rawPoints.push({ x, y: parsedFn(x) }); } catch { rawPoints.push({ x, y: NaN }); }
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('x', `"use strict"; return (${el.expression});`) as (x: number) => number;
      for (let i = 0; i < steps; i++) {
        const x = xMin + i * dx;
        try { rawPoints.push({ x, y: fn(x) }); } catch { rawPoints.push({ x, y: NaN }); }
      }
    }
  }

  if (rawPoints.length < 2) return result;

  // Split on discontinuities (non-finite values or large jumps)
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const slopeDx = (xMax - xMin) / Math.max(1, rawPoints.length - 1);
  const jumpThreshold = Math.abs(ySpan * 5 * slopeDx / (xSpan || 1));

  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i]!;
    if (!Number.isFinite(p.y)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    if (current.length > 0) {
      const prev = current[current.length - 1]!;
      if (Math.abs(p.y - prev.y) > jumpThreshold) {
        segments.push(current);
        current = [p];
        continue;
      }
    }
    current.push(p);
  }
  if (current.length > 0) segments.push(current);

  // Detect x-axis intercepts for marker rendering
  const intercepts: Array<{ x: number; y: number }> = [];

  // Convert each segment to line DrawElements
  let segIdx = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.length - 1; i++) {
      const from = seg[i]!;
      const to = seg[i + 1]!;
      result.push({
        id: `${el.id}-seg${segIdx}-${i}`,
        type: 'line',
        from: { x: toCanvasX(from.x), y: toCanvasY(from.y) },
        to: { x: toCanvasX(to.x), y: toCanvasY(to.y) },
        color: curveColor,
        stroke_width: curveWidth,
      });
      // Detect zero crossings for intercept markers
      if (from.y * to.y < 0 && isMathStyle) {
        const t = from.y / (from.y - to.y);
        const ix = from.x + t * (to.x - from.x);
        intercepts.push({ x: ix, y: 0 });
      }
    }
    segIdx++;
  }

  // Render x-intercept markers as small filled dots (mathematical styles only)
  for (let i = 0; i < intercepts.length; i++) {
    const pt = intercepts[i]!;
    result.push({
      id: `${el.id}-xint-${i}`,
      type: 'ellipse',
      cx: toCanvasX(pt.x),
      cy: toCanvasY(0),
      rx: 3,
      ry: 3,
      color: curveColor,
      stroke_width: 1.5,
    });
  }

  // Label — placed at the rightmost evaluated point, offset up/right.
  // If that would go off-canvas, flip to the left side.
  if (el.label) {
    // Find the rightmost finite point across all segments
    let rightmostPt: { x: number; y: number } | null = null;
    for (const seg of segments) {
      for (const pt of seg) {
        if (!Number.isFinite(pt.y)) continue;
        if (!rightmostPt || pt.x > rightmostPt.x) {
          rightmostPt = pt;
        }
      }
    }

    const LABEL_OFFSET_X = 8;
    const LABEL_OFFSET_Y = -12;
    const ESTIMATED_LABEL_WIDTH = 60; // approximate width of a label in canvas px

    let labelX: number;
    let labelY: number;

    if (rightmostPt) {
      const canvasX = toCanvasX(rightmostPt.x);
      const canvasY = toCanvasY(rightmostPt.y);

      // Check if label would go off the right edge of the plot region
      const rightEdge = el.x + el.width;
      if (canvasX + LABEL_OFFSET_X + ESTIMATED_LABEL_WIDTH > rightEdge) {
        // Flip to left side of the rightmost point
        labelX = canvasX - LABEL_OFFSET_X - ESTIMATED_LABEL_WIDTH;
        // Clamp to left edge of plot
        if (labelX < el.x) labelX = el.x + 4;
      } else {
        labelX = canvasX + LABEL_OFFSET_X;
      }
      labelY = canvasY + LABEL_OFFSET_Y;

      // Clamp vertically within plot
      if (labelY < el.y) labelY = el.y + 4;
      if (labelY > el.y + el.height - 16) labelY = el.y + el.height - 16;
    } else {
      // Fallback: top-right corner of plot
      labelX = el.x + el.width + LABEL_OFFSET_X;
      labelY = el.y + 4;
    }

    if (shouldUseLaTeX(el.label)) {
      result.push({
        id: `${el.id}-label`,
        type: 'latex' as const,
        x: labelX,
        y: labelY,
        tex: el.label,
        fontSize: 14,
        displayMode: false,
      });
    } else {
      result.push({
        id: `${el.id}-label`,
        type: 'text',
        x: labelX,
        y: labelY,
        text: el.label,
        size: 14,
        color: curveColor,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// ParametricCurve / PolarPlot expansion
// ---------------------------------------------------------------------------

/**
 * Parse a math expression that uses variable `varName` instead of `x`.
 * Works by replacing standalone occurrences of the variable with `x`
 * before delegating to the standard parser.
 */
function parseMathExprWithVar(expr: string, varName: string): ((v: number) => number) | null {
  const re = new RegExp(`\\b${varName}\\b`, 'g');
  const normalized = expr.replace(re, 'x');
  return parseMathExpression(normalized);
}

function expandParametricCurve(el: ParametricCurveElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const [xMin, xMax] = el.xRange;
  const [yMin, yMax] = el.yRange;
  const curveColor = el.color ?? '#1f2a44';
  const isMathStyle = el.style === 'mathematical' || el.style === 'blueprint_neat';
  const curveWidth = el.stroke_width ?? (isMathStyle ? 1.5 : 1.8);
  const steps = el.steps ?? 200;

  const xFn = parseMathExprWithVar(el.xExpression, 't');
  const yFn = parseMathExprWithVar(el.yExpression, 't');
  if (!xFn || !yFn) return result;

  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin, xMax, yMin, yMax },
  );

  // Sample parametric curve
  const dt = (el.tMax - el.tMin) / (steps - 1);
  const rawPoints: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < steps; i++) {
    const t = el.tMin + i * dt;
    try {
      const px = xFn(t);
      const py = yFn(t);
      rawPoints.push({ x: px, y: py });
    } catch {
      rawPoints.push({ x: NaN, y: NaN });
    }
  }

  if (rawPoints.length < 2) return result;

  // Split on discontinuities (non-finite values)
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const p of rawPoints) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    current.push(p);
  }
  if (current.length > 0) segments.push(current);

  // Convert each segment to line DrawElements
  let segIdx = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.length - 1; i++) {
      const from = seg[i]!;
      const to = seg[i + 1]!;
      result.push({
        id: `${el.id}-seg${segIdx}-${i}`,
        type: 'line',
        from: { x: toCanvasX(from.x), y: toCanvasY(from.y) },
        to: { x: toCanvasX(to.x), y: toCanvasY(to.y) },
        color: curveColor,
        stroke_width: curveWidth,
      });
    }
    segIdx++;
  }

  // Label
  if (el.label) {
    result.push({
      id: `${el.id}-label`,
      type: 'text',
      x: el.x + el.width + 8,
      y: el.y + 4,
      text: el.label,
      size: 14,
      color: curveColor,
    });
  }

  return result;
}

function expandPolarPlot(el: PolarPlotElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const { cx, cy, radius } = el;
  const curveColor = el.color ?? '#1f2a44';
  const isMathStyle = el.style === 'mathematical' || el.style === 'blueprint_neat';
  const curveWidth = el.stroke_width ?? (isMathStyle ? 1.5 : 1.8);
  const steps = el.steps ?? 200;
  const thetaMin = el.thetaMin ?? 0;
  const thetaMax = el.thetaMax ?? 2 * Math.PI;
  const showGrid = el.showPolarGrid !== false;

  const rFn = parseMathExprWithVar(el.expression, 'theta');
  if (!rFn) return result;

  // Determine max r for grid scaling by sampling the curve
  const dTheta = (thetaMax - thetaMin) / (steps - 1);
  const sampledPoints: Array<{ r: number; theta: number }> = [];
  let maxR = 0;
  for (let i = 0; i < steps; i++) {
    const theta = thetaMin + i * dTheta;
    try {
      const r = rFn(theta);
      if (Number.isFinite(r)) {
        sampledPoints.push({ r, theta });
        maxR = Math.max(maxR, Math.abs(r));
      } else {
        sampledPoints.push({ r: NaN, theta });
      }
    } catch {
      sampledPoints.push({ r: NaN, theta });
    }
  }

  if (maxR === 0) maxR = 1;
  const scale = radius / maxR;

  // Polar grid
  if (showGrid) {
    const gridColor = '#cbd5e1';
    // Concentric circles at integer r values
    const maxCircles = Math.min(Math.ceil(maxR), 6);
    for (let ri = 1; ri <= maxCircles; ri++) {
      const gridR = ri * scale;
      const gridSteps = 60;
      for (let j = 0; j < gridSteps; j++) {
        const a0 = (2 * Math.PI * j) / gridSteps;
        const a1 = (2 * Math.PI * (j + 1)) / gridSteps;
        result.push({
          id: `${el.id}-grid-r${ri}-${j}`,
          type: 'line',
          from: { x: cx + gridR * Math.cos(a0), y: cy - gridR * Math.sin(a0) },
          to: { x: cx + gridR * Math.cos(a1), y: cy - gridR * Math.sin(a1) },
          color: gridColor,
          stroke_width: 0.5,
          lineStyle: 'dashed',
        });
      }
    }
    // Radial lines at every 30°
    for (let deg = 0; deg < 360; deg += 30) {
      const a = (deg * Math.PI) / 180;
      result.push({
        id: `${el.id}-grid-a${deg}`,
        type: 'line',
        from: { x: cx, y: cy },
        to: { x: cx + radius * Math.cos(a), y: cy - radius * Math.sin(a) },
        color: gridColor,
        stroke_width: 0.5,
        lineStyle: 'dashed',
      });
    }
  }

  // Convert sampled polar points to canvas coords and produce line segments
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const sp of sampledPoints) {
    if (!Number.isFinite(sp.r)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    current.push({
      x: cx + sp.r * Math.cos(sp.theta) * scale,
      y: cy - sp.r * Math.sin(sp.theta) * scale,
    });
  }
  if (current.length > 0) segments.push(current);

  let segIdx = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.length - 1; i++) {
      const from = seg[i]!;
      const to = seg[i + 1]!;
      result.push({
        id: `${el.id}-seg${segIdx}-${i}`,
        type: 'line',
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        color: curveColor,
        stroke_width: curveWidth,
      });
    }
    segIdx++;
  }

  // Label
  if (el.label) {
    result.push({
      id: `${el.id}-label`,
      type: 'text',
      x: cx + radius + 8,
      y: cy - radius,
      text: el.label,
      size: 14,
      color: curveColor,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// CartesianAxes / NumberLine / VectorArrow expansion
// ---------------------------------------------------------------------------

function expandCartesianAxes(el: CartesianAxesElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const { x, y, width, height, xRange, yRange } = el;
  const color = el.color ?? '#1f2a44';
  // Axes are drawn thicker than function curves (2px vs 1.5px) for visual hierarchy
  const sw = el.stroke_width ?? 2;

  const xSpan = xRange[1] - xRange[0];
  const ySpan = yRange[1] - yRange[0];
  if (xSpan <= 0 || ySpan <= 0) return result;

  // Map logical coordinates to canvas coordinates via shared utility
  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x, y, width, height },
    { xMin: xRange[0], xMax: xRange[1], yMin: yRange[0], yMax: yRange[1] },
  );

  // Origin position (where logical 0 maps, clamped to plot bounds)
  const clampedZeroX = Math.max(xRange[0], Math.min(xRange[1], 0));
  const clampedZeroY = Math.max(yRange[0], Math.min(yRange[1], 0));
  const originX = toCanvasX(clampedZeroX);
  const originY = toCanvasY(clampedZeroY);

  const TICK_HALF = 5;

  // --- Gridlines (render first so they appear behind axes) ---
  if (el.gridlines) {
    const xTicks = tickMarksForRange(xRange[0], xRange[1], 10);
    for (let i = 0; i < xTicks.length; i++) {
      const t = xTicks[i]!;
      if (t.value === 0) continue;
      const sx = toCanvasX(t.value);
      result.push({
        id: `${el.id}-xgrid-${i}`,
        type: 'line' as const,
        from: { x: sx, y },
        to: { x: sx, y: y + height },
        color: '#cccccc',
        stroke_width: 0.4,
        lineStyle: 'dotted' as const,
      });
    }
    const yTicks = tickMarksForRange(yRange[0], yRange[1], 10);
    for (let i = 0; i < yTicks.length; i++) {
      const t = yTicks[i]!;
      if (t.value === 0) continue;
      const sy = toCanvasY(t.value);
      result.push({
        id: `${el.id}-ygrid-${i}`,
        type: 'line' as const,
        from: { x, y: sy },
        to: { x: x + width, y: sy },
        color: '#cccccc',
        stroke_width: 0.4,
        lineStyle: 'dotted' as const,
      });
    }
  }

  // --- Axis arrows (extend slightly beyond plot for clean arrow tips) ---
  const ARROW_EXT = 6;
  result.push({
    id: `${el.id}-x-axis`,
    type: 'arrow' as const,
    from: { x: x - ARROW_EXT, y: originY },
    to: { x: x + width + ARROW_EXT, y: originY },
    color,
    stroke_width: sw,
  });
  result.push({
    id: `${el.id}-y-axis`,
    type: 'arrow' as const,
    from: { x: originX, y: y + height + ARROW_EXT },
    to: { x: originX, y: y - ARROW_EXT },
    color,
    stroke_width: sw,
  });

  // --- X tick marks + labels ---
  const xTicks = tickMarksForRange(xRange[0], xRange[1], 10);
  for (let i = 0; i < xTicks.length; i++) {
    const t = xTicks[i]!;
    if (t.value === 0) continue;
    const sx = toCanvasX(t.value);
    result.push({
      id: `${el.id}-xtick-${i}`,
      type: 'line' as const,
      from: { x: sx, y: originY - TICK_HALF },
      to: { x: sx, y: originY + TICK_HALF },
      color,
      stroke_width: 1,
    });
    result.push({
      id: `${el.id}-xtlbl-${i}`,
      type: 'text' as const,
      x: sx - 4,
      y: originY + TICK_HALF + 12,
      text: t.label,
      size: 10,
      color,
    });
  }

  // --- Y tick marks + labels ---
  const yTicks = tickMarksForRange(yRange[0], yRange[1], 10);
  for (let i = 0; i < yTicks.length; i++) {
    const t = yTicks[i]!;
    if (t.value === 0) continue;
    const sy = toCanvasY(t.value);
    result.push({
      id: `${el.id}-ytick-${i}`,
      type: 'line' as const,
      from: { x: originX - TICK_HALF, y: sy },
      to: { x: originX + TICK_HALF, y: sy },
      color,
      stroke_width: 1,
    });
    result.push({
      id: `${el.id}-ytlbl-${i}`,
      type: 'text' as const,
      x: originX - TICK_HALF - 18,
      y: sy,
      text: t.label,
      size: 10,
      color,
    });
  }

  // --- Origin label (only if origin is inside plot and won't overlap nearby ticks) ---
  const originInsidePlot =
    originX >= x && originX <= x + width &&
    originY >= y && originY <= y + height;
  if (originInsidePlot) {
    const xTickStep = xTicks.length >= 2 ? Math.abs(toCanvasX(xTicks[1]!.value) - toCanvasX(xTicks[0]!.value)) : Infinity;
    const yTickStep = yTicks.length >= 2 ? Math.abs(toCanvasY(yTicks[1]!.value) - toCanvasY(yTicks[0]!.value)) : Infinity;
    if (xTickStep > 16 && yTickStep > 16) {
      result.push({
        id: `${el.id}-origin`,
        type: 'text' as const,
        x: originX - 10,
        y: originY + TICK_HALF + 12,
        text: '0',
        size: 10,
        color,
      });
    }
  }

  // --- Axis labels (positioned at arrow endpoints) ---
  if (el.xLabel) {
    // x-axis label at right end, offset 15px right and 10px down
    const xLabelX = x + width + ARROW_EXT + 15;
    const xLabelY = originY + 10;
    if (shouldUseLaTeX(el.xLabel)) {
      result.push({
        id: `${el.id}-x-label`,
        type: 'latex' as const,
        x: xLabelX,
        y: xLabelY,
        tex: el.xLabel,
        fontSize: 13,
        displayMode: false,
      });
    } else {
      result.push({
        id: `${el.id}-x-label`,
        type: 'text' as const,
        x: xLabelX,
        y: xLabelY,
        text: el.xLabel,
        size: 13,
        color,
      });
    }
  }
  if (el.yLabel) {
    // y-axis label at top end, offset 10px left and 15px up
    const yLabelX = originX - 10;
    const yLabelY = y - ARROW_EXT - 15;
    if (shouldUseLaTeX(el.yLabel)) {
      result.push({
        id: `${el.id}-y-label`,
        type: 'latex' as const,
        x: yLabelX,
        y: yLabelY,
        tex: el.yLabel,
        fontSize: 13,
        displayMode: false,
      });
    } else {
      result.push({
        id: `${el.id}-y-label`,
        type: 'text' as const,
        x: yLabelX,
        y: yLabelY,
        text: el.yLabel,
        size: 13,
        color,
      });
    }
  }

  return result;
}

function expandNumberLine(el: NumberLineElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const { x, y, length, min, max } = el;
  const color = el.color ?? '#1f2a44';
  // Number line axis drawn thicker than curves for visual hierarchy
  const sw = el.stroke_width ?? 2;

  const span = max - min;
  if (span <= 0 || length <= 0) return result;
  const scale = length / span;
  const toCanvasX = (v: number) => x + (v - min) * scale;

  // Arrow extension for clean endpoints
  const ARROW_EXT = 6;

  // Shaded region (rendered first, behind everything else)
  if (el.region) {
    const regionColor = el.region.color ?? 'rgba(37,99,235,0.15)';
    const rStartX = toCanvasX(Math.max(min, el.region.start));
    const rEndX = toCanvasX(Math.min(max, el.region.end));
    const regionHeight = 16;
    result.push({
      id: `${el.id}-region`,
      type: 'rect' as const,
      x: rStartX,
      y: y - regionHeight / 2,
      w: Math.max(0, rEndX - rStartX),
      h: regionHeight,
      color: regionColor,
      fillColor: regionColor,
    });
  }

  // Main axis arrow with clean extended endpoints
  result.push({
    id: `${el.id}-axis`,
    type: 'arrow' as const,
    from: { x: x - ARROW_EXT, y },
    to: { x: x + length + ARROW_EXT, y },
    color,
    stroke_width: sw,
  });

  // Intervals (thicker line segments, rendered before ticks)
  if (el.intervals) {
    for (let i = 0; i < el.intervals.length; i++) {
      const iv = el.intervals[i]!;
      const fromX = toCanvasX(Math.max(min, iv.from));
      const toX = toCanvasX(Math.min(max, iv.to));
      result.push({
        id: `${el.id}-interval-${i}`,
        type: 'line' as const,
        from: { x: fromX, y },
        to: { x: toX, y },
        color: iv.color ?? color,
        stroke_width: sw * 2.5,
      });
    }
  }

  // Tick marks + labels (below the line)
  const TICK_HALF = 5;
  const ticks = tickMarksForRange(min, max, 10);
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i]!;
    const sx = toCanvasX(t.value);
    result.push({
      id: `${el.id}-tick-${i}`,
      type: 'line' as const,
      from: { x: sx, y: y - TICK_HALF },
      to: { x: sx, y: y + TICK_HALF },
      color,
      stroke_width: 1,
    });
    result.push({
      id: `${el.id}-tlbl-${i}`,
      type: 'text' as const,
      x: sx - 4,
      y: y + TICK_HALF + 12,
      text: t.label,
      size: 10,
      color,
    });
  }

  // Highlighted points (filled dots as small ellipses)
  if (el.highlights) {
    for (let i = 0; i < el.highlights.length; i++) {
      const h = el.highlights[i]!;
      const hx = toCanvasX(h.value);
      const dotColor = h.color ?? color;
      result.push({
        id: `${el.id}-hl-${i}`,
        type: 'ellipse' as const,
        cx: hx,
        cy: y,
        rx: 3.5,
        ry: 3.5,
        color: dotColor,
        fillColor: dotColor,
        stroke_width: 2,
      });
      if (h.label) {
        result.push({
          id: `${el.id}-hllbl-${i}`,
          type: 'text' as const,
          x: hx,
          y: y - TICK_HALF - 8,
          text: h.label,
          size: 11,
          color: dotColor,
        });
      }
    }
  }

  // Label (centered above line)
  if (el.label) {
    result.push({
      id: `${el.id}-label`,
      type: 'text' as const,
      x: x + length / 2,
      y: y - 18,
      text: el.label,
      size: 13,
      color,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Interval diagram expansion
// ---------------------------------------------------------------------------

function expandIntervalDiagram(el: IntervalDiagramElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const color = el.color ?? '#1f2a44';
  const sw = el.stroke_width ?? 2;
  const width = el.width ?? 400;
  const PADDING = 20;

  if (el.intervals.length === 0) return result;

  // Compute axis range from intervals (ignoring ±Infinity)
  const finiteValues: number[] = [];
  for (const iv of el.intervals) {
    if (Number.isFinite(iv.start)) finiteValues.push(iv.start);
    if (Number.isFinite(iv.end)) finiteValues.push(iv.end);
  }
  if (finiteValues.length === 0) {
    finiteValues.push(-5, 5);
  }
  const dataMin = Math.min(...finiteValues);
  const dataMax = Math.max(...finiteValues);
  const margin = Math.max(1, (dataMax - dataMin) * 0.15) || 2;
  const axisMin = el.xMin ?? Math.floor(dataMin - margin);
  const axisMax = el.xMax ?? Math.ceil(dataMax + margin);
  const span = axisMax - axisMin;
  if (span <= 0) return result;

  const lineWidth = width - 2 * PADDING;
  const lineX = el.x + PADDING;
  const lineY = el.y;
  const scale = lineWidth / span;
  const toCanvasX = (v: number) => lineX + (v - axisMin) * scale;

  // Main axis arrow
  result.push({
    id: `${el.id}-axis`,
    type: 'arrow' as const,
    from: { x: lineX - 6, y: lineY },
    to: { x: lineX + lineWidth + 6, y: lineY },
    color,
    stroke_width: sw,
  });

  // Tick marks at integer values
  const TICK_HALF = 5;
  const ticks = tickMarksForRange(axisMin, axisMax, 10);
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i]!;
    const tx = toCanvasX(t.value);
    result.push({
      id: `${el.id}-tick-${i}`,
      type: 'line' as const,
      from: { x: tx, y: lineY - TICK_HALF },
      to: { x: tx, y: lineY + TICK_HALF },
      color,
      stroke_width: 1,
    });
    result.push({
      id: `${el.id}-tlbl-${i}`,
      type: 'text' as const,
      x: tx - 4,
      y: lineY + TICK_HALF + 12,
      text: t.label,
      size: 10,
      color,
    });
  }

  // Render each interval
  const DEFAULT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];
  for (let i = 0; i < el.intervals.length; i++) {
    const iv = el.intervals[i]!;
    const ivColor = iv.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]!;
    const startInf = !Number.isFinite(iv.start);
    const endInf = !Number.isFinite(iv.end);
    const startOpen = iv.startOpen ?? false;
    const endOpen = iv.endOpen ?? false;

    const segStartX = startInf ? lineX : toCanvasX(iv.start);
    const segEndX = endInf ? lineX + lineWidth : toCanvasX(iv.end);
    const clampedStartX = Math.max(lineX, segStartX);
    const clampedEndX = Math.min(lineX + lineWidth, segEndX);

    // Thick colored segment
    result.push({
      id: `${el.id}-seg-${i}`,
      type: 'line' as const,
      from: { x: clampedStartX, y: lineY },
      to: { x: clampedEndX, y: lineY },
      color: ivColor,
      stroke_width: sw * 2.5,
    });

    // Start endpoint marker (closed = filled dot, open = ring)
    if (!startInf) {
      const DOT_R = 4;
      result.push({
        id: `${el.id}-ep-s-${i}`,
        type: 'ellipse' as const,
        cx: segStartX,
        cy: lineY,
        rx: DOT_R,
        ry: DOT_R,
        color: ivColor,
        ...(startOpen ? {} : { fillColor: ivColor }),
        stroke_width: startOpen ? 2 : 1,
      });
    } else {
      // Arrow extending to left edge for -Infinity
      result.push({
        id: `${el.id}-arr-s-${i}`,
        type: 'arrow' as const,
        from: { x: clampedEndX, y: lineY - 1 },
        to: { x: lineX - 4, y: lineY - 1 },
        color: ivColor,
        stroke_width: sw * 1.5,
      });
    }

    // End endpoint marker
    if (!endInf) {
      const DOT_R = 4;
      result.push({
        id: `${el.id}-ep-e-${i}`,
        type: 'ellipse' as const,
        cx: segEndX,
        cy: lineY,
        rx: DOT_R,
        ry: DOT_R,
        color: ivColor,
        ...(endOpen ? {} : { fillColor: ivColor }),
        stroke_width: endOpen ? 2 : 1,
      });
    } else {
      // Arrow extending to right edge for +Infinity
      result.push({
        id: `${el.id}-arr-e-${i}`,
        type: 'arrow' as const,
        from: { x: clampedStartX, y: lineY - 1 },
        to: { x: lineX + lineWidth + 4, y: lineY - 1 },
        color: ivColor,
        stroke_width: sw * 1.5,
      });
    }

    // Interval label above segment
    if (iv.label) {
      const midX = (clampedStartX + clampedEndX) / 2;
      result.push({
        id: `${el.id}-ivlbl-${i}`,
        type: 'text' as const,
        x: midX,
        y: lineY - 14,
        text: iv.label,
        size: 11,
        color: ivColor,
      });
    }
  }

  // Title above everything
  if (el.title) {
    result.push({
      id: `${el.id}-title`,
      type: 'text' as const,
      x: el.x + width / 2,
      y: lineY - 28,
      text: el.title,
      size: 14,
      color,
      align: 'center' as const,
    });
  }

  // Interval notation text below
  if (el.showNotation) {
    const parts: string[] = [];
    for (const iv of el.intervals) {
      const startBracket = iv.startOpen ? '(' : '[';
      const endBracket = iv.endOpen ? ')' : ']';
      const startStr = Number.isFinite(iv.start) ? String(iv.start) : '-∞';
      const endStr = Number.isFinite(iv.end) ? String(iv.end) : '∞';
      parts.push(`${startBracket}${startStr}, ${endStr}${endBracket}`);
    }
    const notation = parts.join(' ∪ ');
    result.push({
      id: `${el.id}-notation`,
      type: 'text' as const,
      x: el.x + width / 2,
      y: lineY + TICK_HALF + 28,
      text: notation,
      size: 12,
      color,
      align: 'center' as const,
    });
  }

  return result;
}

function expandVectorArrow(el: VectorArrowElement): DrawElement[] {
  const result: DrawElement[] = [];
  const { x, y, dx, dy } = el;
  const color = el.color ?? '#1f2a44';
  const thickWidth = (el.stroke_width ?? 1.5) * 2;

  const len = Math.hypot(dx, dy);
  if (len < 0.5) return result;

  const from: Point = { x, y };
  const to: Point = { x: x + dx, y: y + dy };

  // Thick shaft
  result.push({
    id: `${el.id}-shaft`,
    type: 'line' as const,
    from,
    to,
    color,
    stroke_width: thickWidth,
  });

  // Arrowhead via computeArrowHead — scale with line width
  const headLength = Math.min(14, len * 0.3);
  const head = computeArrowHead(from, to, headLength, Math.PI / 6, thickWidth);
  result.push({
    id: `${el.id}-head-l`,
    type: 'line' as const,
    from: to,
    to: head.left,
    color,
    stroke_width: thickWidth,
  });
  result.push({
    id: `${el.id}-head-r`,
    type: 'line' as const,
    from: to,
    to: head.right,
    color,
    stroke_width: thickWidth,
  });

  // Label offset perpendicular to vector direction (avoids overlap with shaft)
  if (el.label) {
    const perpX = dy / len;
    const perpY = -dx / len;
    const LABEL_OFFSET = 12;
    result.push({
      id: `${el.id}-label`,
      type: 'text' as const,
      x: x + dx / 2 + LABEL_OFFSET * perpX,
      y: y + dy / 2 + LABEL_OFFSET * perpY,
      text: el.label,
      size: 13,
      color,
    });
  }

  return result;
}

function expandCircleWithRadius(el: CircleWithRadiusElement): DrawElement[] {
  const result: DrawElement[] = [];
  const { cx, cy, r, id } = el;
  const color = el.color ?? '#1f2a44';
  const showCenter = el.showCenter !== false;
  const showRadius = el.showRadius !== false;
  const radiusAngle = el.radiusAngle ?? Math.PI / 4;

  // Main circle (as ellipse with rx = ry = r)
  result.push({
    id: `${id}-circle`,
    type: 'ellipse' as const,
    cx,
    cy,
    rx: r,
    ry: r,
    color,
    stroke_width: el.stroke_width ?? 1.5,
  });

  // Center dot (small filled ellipse)
  if (showCenter) {
    result.push({
      id: `${id}-center`,
      type: 'ellipse' as const,
      cx,
      cy,
      rx: 3,
      ry: 3,
      color,
    });
  }

  // Radius line
  if (showRadius) {
    const rx = cx + r * Math.cos(radiusAngle);
    const ry = cy - r * Math.sin(radiusAngle);
    result.push({
      id: `${id}-radius`,
      type: 'line' as const,
      from: { x: cx, y: cy },
      to: { x: rx, y: ry },
      color,
      stroke_width: el.stroke_width ?? 1,
      lineStyle: 'dashed' as const,
    });

    // Label at midpoint of radius
    if (el.label) {
      const mx = (cx + rx) / 2;
      const my = (cy + ry) / 2;
      const offsetX = 8 * Math.sin(radiusAngle);
      const offsetY = 8 * Math.cos(radiusAngle);
      result.push({
        id: `${id}-label`,
        type: 'text' as const,
        x: mx + offsetX,
        y: my + offsetY,
        text: el.label,
        size: 14,
        color,
      });
    }
  }

  return result;
}

function expandTriangleWithAngles(el: TriangleWithAnglesElement): DrawElement[] {
  const result: DrawElement[] = [];
  const { vertices, id } = el;
  const color = el.color ?? '#1f2a44';
  const showAngles = el.showAngles !== false;
  const showSides = el.showSides !== false;
  const v = vertices;

  // 3 sides: side 0 = v[0]→v[1], side 1 = v[1]→v[2], side 2 = v[2]→v[0]
  const sides: [number, number][] = [[0, 1], [1, 2], [2, 0]];
  for (let i = 0; i < 3; i++) {
    const [a, b] = sides[i]!;
    result.push({
      id: `${id}-side-${i}`,
      type: 'line' as const,
      from: { x: v[a]!.x, y: v[a]!.y },
      to: { x: v[b]!.x, y: v[b]!.y },
      color,
      stroke_width: el.stroke_width ?? 1.5,
    });
  }

  // Centroid for outward offset direction
  const centroidX = (v[0]!.x + v[1]!.x + v[2]!.x) / 3;
  const centroidY = (v[0]!.y + v[1]!.y + v[2]!.y) / 3;

  // Vertex labels (A, B, C or custom)
  for (let i = 0; i < 3; i++) {
    const vt = v[i]!;
    const label = vt.label;
    if (label) {
      // Offset outward from centroid
      const dx = vt.x - centroidX;
      const dy = vt.y - centroidY;
      const dist = Math.hypot(dx, dy) || 1;
      const offsetDist = 18;
      result.push({
        id: `${id}-vlabel-${i}`,
        type: 'text' as const,
        x: vt.x + (dx / dist) * offsetDist,
        y: vt.y + (dy / dist) * offsetDist,
        text: label,
        size: 14,
        color,
      });
    }
  }

  // Side labels (a, b, c)
  if (showSides) {
    const defaultSideLabels = ['a', 'b', 'c'];
    for (let i = 0; i < 3; i++) {
      const [a, b] = sides[i]!;
      const label = el.sideLabels?.[i] ?? defaultSideLabels[i]!;
      const mx = (v[a]!.x + v[b]!.x) / 2;
      const my = (v[a]!.y + v[b]!.y) / 2;
      // Offset away from centroid
      const dx = mx - centroidX;
      const dy = my - centroidY;
      const dist = Math.hypot(dx, dy) || 1;
      const offsetDist = 16;
      result.push({
        id: `${id}-slabel-${i}`,
        type: 'text' as const,
        x: mx + (dx / dist) * offsetDist,
        y: my + (dy / dist) * offsetDist,
        text: label,
        size: 13,
        color,
      });
    }
  }

  // Angle arcs at each vertex
  if (showAngles) {
    const arcRadius = 20;
    const arcSteps = 16;
    const defaultAngleLabels = ['α', 'β', 'γ'];
    // vertex order: angle at v[i] is formed by edges v[i]→v[prev] and v[i]→v[next]
    for (let i = 0; i < 3; i++) {
      const prev = (i + 2) % 3;
      const next = (i + 1) % 3;
      const vx = v[i]!.x;
      const vy = v[i]!.y;
      // Vectors from vertex to adjacent vertices
      const dx1 = v[prev]!.x - vx;
      const dy1 = v[prev]!.y - vy;
      const dx2 = v[next]!.x - vx;
      const dy2 = v[next]!.y - vy;
      let angle1 = Math.atan2(dy1, dx1);
      let angle2 = Math.atan2(dy2, dx2);
      // Ensure we draw the interior arc (shorter arc)
      let sweep = angle2 - angle1;
      if (sweep < -Math.PI) sweep += 2 * Math.PI;
      if (sweep > Math.PI) sweep -= 2 * Math.PI;
      const startAngle = sweep > 0 ? angle1 : angle2;
      const endAngle = sweep > 0 ? angle2 : angle1;

      // Build arc polyline as short line segments
      let aStart = startAngle;
      let aSweep = endAngle - startAngle;
      if (aSweep < 0) aSweep += 2 * Math.PI;

      for (let s = 0; s < arcSteps; s++) {
        const t0 = aStart + (aSweep * s) / arcSteps;
        const t1 = aStart + (aSweep * (s + 1)) / arcSteps;
        result.push({
          id: `${id}-arc-${i}-${s}`,
          type: 'line' as const,
          from: { x: vx + arcRadius * Math.cos(t0), y: vy + arcRadius * Math.sin(t0) },
          to: { x: vx + arcRadius * Math.cos(t1), y: vy + arcRadius * Math.sin(t1) },
          color,
          stroke_width: 1,
        });
      }

      // Angle label inside the arc
      const aLabel = el.angleLabels?.[i] ?? defaultAngleLabels[i]!;
      const midAngle = aStart + aSweep / 2;
      const labelRadius = arcRadius + 12;
      result.push({
        id: `${id}-alabel-${i}`,
        type: 'text' as const,
        x: vx + labelRadius * Math.cos(midAngle),
        y: vy + labelRadius * Math.sin(midAngle),
        text: aLabel,
        size: 12,
        color,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Riemann sum expansion
// ---------------------------------------------------------------------------

function expandRiemannSum(el: RiemannSumElement): DrawElement[] {
  const result: DrawElement[] = [];
  const color = el.color ?? '#1f2a44';
  const [xMin, xMax] = el.xRange;
  const [yMin, yMax] = el.yRange;
  const n = el.n ?? 5;
  const method = el.method ?? 'left';
  const showFunction = el.showFunction !== false;
  const showAxes = el.showAxes !== false;
  const isMathStyle = el.style === 'mathematical' || el.style === 'blueprint_neat';

  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin, xMax, yMin, yMax },
  );

  const parsedFn = parseMathExpression(el.expression);
  if (!parsedFn) return result;

  // Optionally draw axes first (underneath)
  if (showAxes) {
    result.push(...expandCartesianAxes({
      id: `${el.id}-axes`,
      type: 'cartesian_axes',
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      xRange: el.xRange,
      yRange: el.yRange,
      style: el.style,
    }));
  }

  const canvasBaseY = toCanvasY(0);
  const dx = (xMax - xMin) / n;
  const rectStroke = el.stroke_width ?? (isMathStyle ? 1 : 1);
  const MIN_RECT_H = 2;

  // Draw rectangles
  for (let i = 0; i < n; i++) {
    const xLeft = xMin + i * dx;
    const xRight = xLeft + dx;

    let sampleX: number;
    if (method === 'right') {
      sampleX = xRight;
    } else if (method === 'midpoint') {
      sampleX = (xLeft + xRight) / 2;
    } else {
      sampleX = xLeft;
    }

    let fVal: number;
    try { fVal = parsedFn(sampleX); } catch { fVal = 0; }
    if (!Number.isFinite(fVal)) fVal = 0;

    const cx1 = toCanvasX(xLeft);
    const cx2 = toCanvasX(xRight);
    const cy0 = canvasBaseY;
    const cyTop = toCanvasY(fVal);

    const rectX = Math.min(cx1, cx2);
    const rectW = Math.abs(cx2 - cx1);
    const rawH = Math.abs(cyTop - cy0);
    // Guard against zero-height rects: ensure minimum visible height
    const rectH = rawH > 0 ? Math.max(rawH, MIN_RECT_H) : MIN_RECT_H;
    const rectY = fVal >= 0
      ? Math.min(cy0, cyTop)
      : cy0;

    if (rectW > 0) {
      result.push({
        id: `${el.id}-rect-${i}`,
        type: 'rect',
        x: rectX,
        y: rectY,
        w: rectW,
        h: rectH,
        color,
        stroke_width: rectStroke,
      });
    }
  }

  // Optionally draw f(x) curve on top
  if (showFunction) {
    result.push(...expandFunctionCurve({
      id: `${el.id}-curve`,
      type: 'function_curve',
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      xRange: el.xRange,
      yRange: el.yRange,
      expression: el.expression,
      style: el.style,
      color,
    }));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tangent line expansion
// ---------------------------------------------------------------------------

function expandTangentLine(el: TangentLineElement): DrawElement[] {
  const result: DrawElement[] = [];
  const color = el.color ?? '#1f2a44';
  const [xMin, xMax] = el.xRange;
  const [yMin, yMax] = el.yRange;
  const atX = el.atX;
  const tangentLength = el.length ?? 2;
  const showPoint = el.showPoint !== false;
  const isMathStyle = el.style === 'mathematical' || el.style === 'blueprint_neat';

  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin, xMax, yMin, yMax },
  );

  const parsedFn = parseMathExpression(el.expression);
  if (!parsedFn) return result;

  let fAtX: number;
  try { fAtX = parsedFn(atX); } catch { return result; }
  if (!Number.isFinite(fAtX)) return result;

  // Numerically approximate f'(atX) using central difference
  const h = 1e-5;
  let fPlus: number, fMinus: number;
  try { fPlus = parsedFn(atX + h); } catch { fPlus = fAtX; }
  try { fMinus = parsedFn(atX - h); } catch { fMinus = fAtX; }
  const slope = (fPlus - fMinus) / (2 * h);

  // Tangent line endpoints in math coordinates
  const halfLen = tangentLength / 2;
  const x1 = atX - halfLen;
  const y1 = fAtX - slope * halfLen;
  const x2 = atX + halfLen;
  const y2 = fAtX + slope * halfLen;

  const tangentWidth = el.stroke_width ?? (isMathStyle ? 1.5 : 1.8);

  result.push({
    id: `${el.id}-tangent`,
    type: 'line',
    from: { x: toCanvasX(x1), y: toCanvasY(y1) },
    to: { x: toCanvasX(x2), y: toCanvasY(y2) },
    color,
    stroke_width: tangentWidth,
  });

  if (showPoint) {
    result.push({
      id: `${el.id}-point`,
      type: 'ellipse',
      cx: toCanvasX(atX),
      cy: toCanvasY(fAtX),
      rx: 4,
      ry: 4,
      color,
      stroke_width: 1.5,
    });
  }

  if (el.label) {
    result.push({
      id: `${el.id}-label`,
      type: 'text',
      x: toCanvasX(atX) + 12,
      y: toCanvasY(fAtX) - 18,
      text: el.label,
      size: 14,
      color,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Histogram expansion
// ---------------------------------------------------------------------------

function expandHistogram(el: HistogramElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const bins = el.bins;
  if (bins.length === 0) return result;

  const showValues = el.showValues !== false;
  const showAxes = el.showAxes !== false;
  const defaultColor = el.color ?? '#4a90d9';

  const maxVal = el.yMax ?? Math.max(...bins.map((b) => b.value)) * 1.2;
  const barGap = 2;
  const barWidth = (el.width - barGap * (bins.length - 1)) / bins.length;

  // Pre-compute alpha variants when bins share the same default color
  const alphaVariants = [1.0, 0.75, 0.55, 0.85, 0.65];

  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i]!;
    let barColor = bin.color ?? defaultColor;
    // Apply alternating alpha to default-colored bars for contrast
    if (!bin.color) {
      const alpha = alphaVariants[i % alphaVariants.length];
      barColor = hexToRgba(defaultColor, alpha);
    }
    const barHeight = maxVal > 0 ? (bin.value / maxVal) * el.height : 0;
    const bx = el.x + i * (barWidth + barGap);
    const by = el.y + el.height - barHeight;

    result.push({
      id: `${el.id}-bar-${i}`,
      type: 'rect',
      x: bx,
      y: by,
      w: Math.max(1, barWidth),
      h: Math.max(1, barHeight),
      color: barColor,
      stroke_width: el.stroke_width ?? 1,
    });

    if (showValues) {
      result.push({
        id: `${el.id}-val-${i}`,
        type: 'text',
        x: bx + barWidth / 2,
        y: by - 8,
        text: String(bin.value),
        size: 12,
        color: el.color ?? '#333',
      });
    }

    // Bin label below x-axis
    result.push({
      id: `${el.id}-lbl-${i}`,
      type: 'text',
      x: bx + barWidth / 2,
      y: el.y + el.height + 16,
      text: bin.label,
      size: 12,
      color: el.color ?? '#333',
    });
  }

  if (showAxes) {
    // Y-axis
    result.push({
      id: `${el.id}-y-axis`,
      type: 'line',
      from: { x: el.x, y: el.y },
      to: { x: el.x, y: el.y + el.height },
      color: '#333',
      stroke_width: 2,
    });
    // X-axis
    result.push({
      id: `${el.id}-x-axis`,
      type: 'line',
      from: { x: el.x, y: el.y + el.height },
      to: { x: el.x + el.width, y: el.y + el.height },
      color: '#333',
      stroke_width: 2,
    });
    // Y-axis tick marks (5 ticks)
    const tickCount = 5;
    for (let t = 0; t <= tickCount; t++) {
      const tickVal = (maxVal / tickCount) * t;
      const tickY = el.y + el.height - (tickVal / maxVal) * el.height;
      result.push({
        id: `${el.id}-ytick-${t}`,
        type: 'line',
        from: { x: el.x - 4, y: tickY },
        to: { x: el.x, y: tickY },
        color: '#333',
        stroke_width: 1,
      });
      result.push({
        id: `${el.id}-ytick-lbl-${t}`,
        type: 'text',
        x: el.x - 10,
        y: tickY,
        text: tickVal % 1 === 0 ? String(tickVal) : tickVal.toFixed(1),
        size: 10,
        color: '#666',
      });
    }
  }

  if (el.xLabel) {
    result.push({
      id: `${el.id}-xlabel`,
      type: 'text',
      x: el.x + el.width / 2,
      y: el.y + el.height + 34,
      text: el.xLabel,
      size: 14,
      color: '#333',
    });
  }

  if (el.yLabel) {
    result.push({
      id: `${el.id}-ylabel`,
      type: 'text',
      x: el.x - 30,
      y: el.y + el.height / 2,
      text: el.yLabel,
      size: 14,
      color: '#333',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Normal distribution curve expansion
// ---------------------------------------------------------------------------

function expandNormalDistribution(el: NormalDistributionCurveElement, _theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const { mu, sigma } = el;
  const curveColor = el.color ?? '#1f2a44';
  const isMathStyle = el.style === 'mathematical' || el.style === 'blueprint_neat';

  const xMin = mu - 4 * sigma;
  const xMax = mu + 4 * sigma;
  const peak = 1 / (sigma * Math.sqrt(2 * Math.PI));
  const yMin = 0;
  const yMax = peak * 1.2;

  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin, xMax, yMin, yMax },
  );

  // Gaussian PDF
  const phi = (x: number) => (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));

  // Sample the curve
  const steps = 160;
  const dx = (xMax - xMin) / (steps - 1);
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < steps; i++) {
    const xVal = xMin + i * dx;
    points.push({ x: xVal, y: phi(xVal) });
  }

  // Draw shaded region if specified
  if (el.shadeFrom != null && el.shadeTo != null) {
    const shadeColor = el.shadeColor ?? 'rgba(100,149,237,0.25)';
    const from = Math.max(el.shadeFrom, xMin);
    const to = Math.min(el.shadeTo, xMax);
    const shadeSteps = 80;
    const shadeDx = (to - from) / (shadeSteps - 1);

    const topCanvas: Array<{ x: number; y: number }> = [];
    const bottomCanvas: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < shadeSteps; i++) {
      const sx = from + i * shadeDx;
      topCanvas.push({ x: toCanvasX(sx), y: toCanvasY(phi(sx)) });
      bottomCanvas.push({ x: toCanvasX(sx), y: toCanvasY(0) });
    }

    const polygon = [...topCanvas, ...bottomCanvas.slice().reverse()];
    for (let i = 0; i < polygon.length; i++) {
      const p0 = polygon[i]!;
      const p1 = polygon[(i + 1) % polygon.length]!;
      result.push({
        id: `${el.id}-shade-${i}`,
        type: 'line',
        from: p0,
        to: p1,
        color: shadeColor,
        stroke_width: 0.5,
      });
    }
  }

  // Draw the curve as line segments
  const curveWidth = el.stroke_width ?? (isMathStyle ? 1.5 : 2);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    result.push({
      id: `${el.id}-curve-${i}`,
      type: 'line',
      from: { x: toCanvasX(p0.x), y: toCanvasY(p0.y) },
      to: { x: toCanvasX(p1.x), y: toCanvasY(p1.y) },
      color: curveColor,
      stroke_width: curveWidth,
    });
  }

  // Mean line
  if (el.showMeanLine !== false) {
    result.push({
      id: `${el.id}-mean`,
      type: 'line',
      from: { x: toCanvasX(mu), y: toCanvasY(0) },
      to: { x: toCanvasX(mu), y: toCanvasY(peak) },
      color: curveColor,
      stroke_width: 1,
      lineStyle: 'dashed',
    });
  }

  // Sigma lines
  if (el.showSigmaLines) {
    for (const k of [-2, -1, 1, 2]) {
      const sx = mu + k * sigma;
      result.push({
        id: `${el.id}-sigma-${k}`,
        type: 'line',
        from: { x: toCanvasX(sx), y: toCanvasY(0) },
        to: { x: toCanvasX(sx), y: toCanvasY(phi(sx)) },
        color: '#999',
        stroke_width: 1,
        lineStyle: 'dashed',
      });
    }
  }

  // Labels — use LaTeX for proper Greek letter rendering
  if (el.showLabels) {
    result.push({
      id: `${el.id}-mu-label`,
      type: 'latex' as const,
      x: toCanvasX(mu),
      y: toCanvasY(0) + 16,
      tex: '\\mu',
      fontSize: 14,
      displayMode: false,
    });
    for (const k of [-2, -1, 1, 2]) {
      const sx = mu + k * sigma;
      const sign = k > 0 ? '+' : '';
      result.push({
        id: `${el.id}-sigma-label-${k}`,
        type: 'latex' as const,
        x: toCanvasX(sx),
        y: toCanvasY(0) + 16,
        tex: `\\mu${sign}${k}\\sigma`,
        fontSize: 11,
        displayMode: false,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Matrix bracket expansion
// ---------------------------------------------------------------------------

/** Parse a semicolon-separated string like "1 0; 0 1" into string[][]. */
export function parseMatrixRows(input: string[][] | string): string[][] {
  if (Array.isArray(input)) return input;
  return input
    .split(';')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map((r) => r.split(/\s+/));
}

/** Compute per-column widths and per-row heights for a matrix grid. */
export function computeMatrixCellSizes(
  rows: string[][],
  fontSize: number,
  explicitCW?: number,
  explicitCH?: number,
): { colWidths: number[]; rowHeights: number[] } {
  const numCols = Math.max(...rows.map((r) => r.length));
  const charW = fontSize * 0.6;
  const pad = fontSize * 0.8;
  const colWidths: number[] = [];
  for (let c = 0; c < numCols; c++) {
    if (explicitCW) { colWidths.push(explicitCW); continue; }
    let maxW = 0;
    for (const row of rows) {
      const cell = row[c] ?? '';
      const w = cell.length * charW + pad;
      if (w > maxW) maxW = w;
    }
    colWidths.push(Math.max(maxW, fontSize * 1.5));
  }
  const rowHeights = rows.map(() => explicitCH ?? fontSize * 2);
  return { colWidths, rowHeights };
}

function cumulativeOffsets(sizes: number[]): number[] {
  const out: number[] = [0];
  for (let i = 0; i < sizes.length; i++) out.push(out[i] + sizes[i]);
  return out;
}

function expandMatrixBracket(el: MatrixBracketElement): DrawElement[] {
  const result: DrawElement[] = [];
  const rows = parseMatrixRows(el.rows);
  if (rows.length === 0) return result;

  const fontSize = 16;
  const { colWidths, rowHeights } = computeMatrixCellSizes(rows, fontSize, el.cellWidth, el.cellHeight);
  const colOffsets = cumulativeOffsets(colWidths);
  const rowOffsets = cumulativeOffsets(rowHeights);
  const gridW = colOffsets[colOffsets.length - 1];
  const gridH = rowOffsets[rowOffsets.length - 1];
  const bracketInset = 12;
  const padX = 8;

  const contentX = el.x + bracketInset + padX;
  const contentY = el.y;

  // Cell text / LaTeX
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cx = contentX + colOffsets[c] + colWidths[c] / 2;
      const cy = contentY + rowOffsets[r] + rowHeights[r] / 2;
      const cell = rows[r][c];
      if (shouldUseLaTeX(cell)) {
        result.push({ id: `${el.id}-cell-${r}-${c}`, type: 'latex', x: cx, y: cy, tex: cell, displayMode: false, fontSize });
      } else {
        result.push({ id: `${el.id}-cell-${r}-${c}`, type: 'text', x: cx, y: cy, text: cell, size: fontSize, align: 'center' });
      }
    }
  }

  // Bracket lines
  const bTop = contentY - 4;
  const bBot = contentY + gridH + 4;
  const bracketStubLen = Math.max(4, gridH * 0.15);
  const leftX = el.x + bracketInset;
  const rightX = el.x + bracketInset + padX * 2 + gridW;

  // Left bracket
  result.push({ id: `${el.id}-bl-v`, type: 'line', from: { x: leftX, y: bTop }, to: { x: leftX, y: bBot } });
  result.push({ id: `${el.id}-bl-t`, type: 'line', from: { x: leftX, y: bTop }, to: { x: leftX + bracketStubLen, y: bTop } });
  result.push({ id: `${el.id}-bl-b`, type: 'line', from: { x: leftX, y: bBot }, to: { x: leftX + bracketStubLen, y: bBot } });

  // Right bracket
  result.push({ id: `${el.id}-br-v`, type: 'line', from: { x: rightX, y: bTop }, to: { x: rightX, y: bBot } });
  result.push({ id: `${el.id}-br-t`, type: 'line', from: { x: rightX, y: bTop }, to: { x: rightX - bracketStubLen, y: bTop } });
  result.push({ id: `${el.id}-br-b`, type: 'line', from: { x: rightX, y: bBot }, to: { x: rightX - bracketStubLen, y: bBot } });

  // Augmented divider
  if (el.augmentedAt != null && el.augmentedAt > 0 && el.augmentedAt < colOffsets.length - 1) {
    const divX = contentX + colOffsets[el.augmentedAt];
    result.push({
      id: `${el.id}-aug-div`,
      type: 'line',
      from: { x: divX, y: bTop },
      to: { x: divX, y: bBot },
      color: '#6b7280',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Linear transform expansion
// ---------------------------------------------------------------------------

function expandLinearTransform(el: LinearTransformElement, theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  const range = el.gridRange ?? 3;
  const isMathStyle = el.style === 'mathematical' || el.style === 'blueprint_neat';
  const gridStroke = isMathStyle ? 0.5 : 0.7;
  const transformedGridStroke = isMathStyle ? 1 : 1.2;
  const basisStroke = isMathStyle ? 1.5 : 2;
  const tc = theme ? getThemeColors(theme) : undefined;
  const origGridColor = tc?.grid ?? '#d1d5db';

  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin: -range, xMax: range, yMin: -range, yMax: range },
  );

  const [[a, b], [c, d]] = el.matrix;
  const transform = (vx: number, vy: number): [number, number] => [a * vx + b * vy, c * vx + d * vy];

  const showGrid = el.showOriginalGrid !== false;
  const showBasis = el.showBasisVectors !== false;

  // Original grid (dashed gray)
  if (showGrid) {
    for (let i = -range; i <= range; i++) {
      // Vertical grid line
      result.push({
        id: `${el.id}-ogv-${i}`,
        type: 'line',
        from: { x: toCanvasX(i), y: toCanvasY(-range) },
        to: { x: toCanvasX(i), y: toCanvasY(range) },
        color: origGridColor,
        stroke_width: gridStroke,
      });
      // Horizontal grid line
      result.push({
        id: `${el.id}-ogh-${i}`,
        type: 'line',
        from: { x: toCanvasX(-range), y: toCanvasY(i) },
        to: { x: toCanvasX(range), y: toCanvasY(i) },
        color: origGridColor,
        stroke_width: gridStroke,
      });
    }
  }

  // Transformed grid (solid colored)
  for (let i = -range; i <= range; i++) {
    // Transformed vertical line: column x=i goes from (i,-range) to (i,range)
    const [tvx1, tvy1] = transform(i, -range);
    const [tvx2, tvy2] = transform(i, range);
    result.push({
      id: `${el.id}-tgv-${i}`,
      type: 'line',
      from: { x: toCanvasX(tvx1), y: toCanvasY(tvy1) },
      to: { x: toCanvasX(tvx2), y: toCanvasY(tvy2) },
      color: '#93c5fd',
      stroke_width: transformedGridStroke,
    });
    // Transformed horizontal line: row y=i goes from (-range,i) to (range,i)
    const [thx1, thy1] = transform(-range, i);
    const [thx2, thy2] = transform(range, i);
    result.push({
      id: `${el.id}-tgh-${i}`,
      type: 'line',
      from: { x: toCanvasX(thx1), y: toCanvasY(thy1) },
      to: { x: toCanvasX(thx2), y: toCanvasY(thy2) },
      color: '#93c5fd',
      stroke_width: transformedGridStroke,
    });
  }

  // Basis vectors
  if (showBasis) {
    const ox = toCanvasX(0);
    const oy = toCanvasY(0);

    // Original basis (gray)
    result.push({ id: `${el.id}-oi`, type: 'arrow', from: { x: ox, y: oy }, to: { x: toCanvasX(1), y: toCanvasY(0) }, color: '#9ca3af', stroke_width: basisStroke });
    result.push({ id: `${el.id}-oj`, type: 'arrow', from: { x: ox, y: oy }, to: { x: toCanvasX(0), y: toCanvasY(1) }, color: '#9ca3af', stroke_width: basisStroke });

    // Transformed basis
    const [ix, iy] = transform(1, 0);
    const [jx, jy] = transform(0, 1);
    result.push({ id: `${el.id}-ti`, type: 'arrow', from: { x: ox, y: oy }, to: { x: toCanvasX(ix), y: toCanvasY(iy) }, color: '#ef4444', stroke_width: basisStroke, label: 'î\'' });
    result.push({ id: `${el.id}-tj`, type: 'arrow', from: { x: ox, y: oy }, to: { x: toCanvasX(jx), y: toCanvasY(jy) }, color: '#22c55e', stroke_width: basisStroke, label: 'ĵ\'' });
  }

  // Additional vectors
  if (el.vectors) {
    for (let vi = 0; vi < el.vectors.length; vi++) {
      const v = el.vectors[vi];
      const ox = toCanvasX(0);
      const oy = toCanvasY(0);
      const col = v.color ?? '#6366f1';
      // Original (dashed placeholder — shown as lighter)
      result.push({ id: `${el.id}-vo-${vi}`, type: 'arrow', from: { x: ox, y: oy }, to: { x: toCanvasX(v.x), y: toCanvasY(v.y) }, color: '#d1d5db', stroke_width: 1.5 });
      // Transformed
      const [tx, ty] = transform(v.x, v.y);
      result.push({ id: `${el.id}-vt-${vi}`, type: 'arrow', from: { x: ox, y: oy }, to: { x: toCanvasX(tx), y: toCanvasY(ty) }, color: col, stroke_width: 1.5, label: v.label });
    }
  }

  // Label
  if (el.label) {
    result.push({ id: `${el.id}-lbl`, type: 'text', x: el.x + el.width / 2, y: el.y - 16, text: el.label, size: 14, color: tc?.text ?? '#222', align: 'center' });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Slope field expander
// ---------------------------------------------------------------------------

function expandSlopeField(el: SlopeFieldElement): DrawElement[] {
  const result: DrawElement[] = [];
  const rows = el.gridRows ?? 12;
  const cols = el.gridCols ?? 16;
  const [xMin, xMax] = el.xRange;
  const [yMin, yMax] = el.yRange;
  const mapper = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin, xMax, yMin, yMax },
  );

  const fn = parseMathExpression2Var(el.expression);
  if (!fn) return result;

  const tickLen = 15;
  const halfTick = tickLen / 2;
  const lineColor = el.strokeColor ?? el.color ?? '#1f2a44';
  const lineWidth = el.strokeWidth ?? el.stroke_width ?? 1;

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const mx = xMin + (c / cols) * (xMax - xMin);
      const my = yMin + (r / rows) * (yMax - yMin);
      const slope = fn(mx, my);
      if (!Number.isFinite(slope)) continue;

      const angle = Math.atan(slope);
      const dx = halfTick * Math.cos(angle);
      const dy = halfTick * Math.sin(angle);

      const cx = mapper.toCanvasX(mx);
      const cy = mapper.toCanvasY(my);

      result.push({
        id: `${el.id}-tick-${r}-${c}`,
        type: 'line',
        from: { x: cx - dx, y: cy + dy },
        to: { x: cx + dx, y: cy - dy },
        color: lineColor,
        stroke_width: lineWidth,
      });
    }
  }

  // Solution curve via Euler's method
  if (el.solutionCurve) {
    const { x0, y0 } = el.solutionCurve;
    const steps = el.solutionCurve.steps ?? 200;
    const dt = (xMax - xMin) / steps;
    const curveColor = '#dc2626';

    // Forward integration
    const forwardPts: Point[] = [];
    let sx = x0, sy = y0;
    for (let i = 0; i <= steps; i++) {
      if (sx < xMin || sx > xMax || sy < yMin - (yMax - yMin) || sy > yMax + (yMax - yMin)) break;
      forwardPts.push({ x: mapper.toCanvasX(sx), y: mapper.toCanvasY(sy) });
      const s = fn(sx, sy);
      if (!Number.isFinite(s)) break;
      sx += dt;
      sy += s * dt;
    }

    // Backward integration
    const backPts: Point[] = [];
    sx = x0; sy = y0;
    for (let i = 0; i < steps; i++) {
      const s = fn(sx, sy);
      if (!Number.isFinite(s)) break;
      sx -= dt;
      sy -= s * dt;
      if (sx < xMin || sx > xMax || sy < yMin - (yMax - yMin) || sy > yMax + (yMax - yMin)) break;
      backPts.unshift({ x: mapper.toCanvasX(sx), y: mapper.toCanvasY(sy) });
    }

    const allPts = [...backPts, ...forwardPts];
    for (let i = 0; i < allPts.length - 1; i++) {
      result.push({
        id: `${el.id}-sol-${i}`,
        type: 'line',
        from: allPts[i]!,
        to: allPts[i + 1]!,
        color: curveColor,
        stroke_width: 2,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Vector field 2D expander
// ---------------------------------------------------------------------------

function expandVectorField2d(el: VectorField2dElement): DrawElement[] {
  const result: DrawElement[] = [];
  const rows = el.gridRows ?? 8;
  const cols = el.gridCols ?? 10;
  const [xMin, xMax] = el.xRange;
  const [yMin, yMax] = el.yRange;
  const mapper = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin, xMax, yMin, yMax },
  );

  const fnPx = parseMathExpression2Var(el.Px);
  const fnPy = parseMathExpression2Var(el.Py);
  if (!fnPx || !fnPy) return result;

  const lineColor = el.strokeColor ?? el.color ?? '#2563eb';
  const arrowLen = Math.min(el.width / (cols + 1), el.height / (rows + 1)) * 0.7;

  // Compute magnitudes for scaling
  const magnitudes: number[] = [];
  const vectors: Array<{ cx: number; cy: number; vx: number; vy: number }> = [];

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const mx = xMin + (c / cols) * (xMax - xMin);
      const my = yMin + (r / rows) * (yMax - yMin);
      const vx = fnPx(mx, my);
      const vy = fnPy(mx, my);
      if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;

      const mag = Math.sqrt(vx * vx + vy * vy);
      magnitudes.push(mag);
      vectors.push({
        cx: mapper.toCanvasX(mx),
        cy: mapper.toCanvasY(my),
        vx, vy,
      });
    }
  }

  const maxMag = Math.max(...magnitudes, 1e-10);

  for (let i = 0; i < vectors.length; i++) {
    const { cx, cy, vx, vy } = vectors[i]!;
    const mag = magnitudes[i]!;
    if (mag < 1e-10) continue;

    let scale: number;
    if (el.normalize) {
      scale = arrowLen;
    } else {
      scale = (mag / maxMag) * arrowLen;
    }

    const nx = (vx / mag) * scale;
    // Negate vy because canvas Y is inverted relative to math Y
    const ny = -(vy / mag) * scale;

    const tipX = cx + nx;
    const tipY = cy + ny;

    result.push({
      id: `${el.id}-vec-${i}`,
      type: 'arrow',
      from: { x: cx, y: cy },
      to: { x: tipX, y: tipY },
      color: lineColor,
      stroke_width: el.stroke_width ?? 1,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Wireframe 3D expander
// ---------------------------------------------------------------------------

interface Vec3 { x: number; y: number; z: number; }

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

function rotateX(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

function project3d(v: Vec3, cx: number, cy: number, size: number, rotX: number, rotY: number): Point {
  const r1 = rotateY(v, rotY);
  const r2 = rotateX(r1, rotX);
  return { x: cx + r2.x * size, y: cy - r2.y * size };
}

function avgZ(vertices: Vec3[], indices: number[], rotX: number, rotY: number): number {
  let sum = 0;
  for (const i of indices) {
    const r1 = rotateY(vertices[i]!, rotY);
    const r2 = rotateX(r1, rotX);
    sum += r2.z;
  }
  return sum / indices.length;
}

function faceNormalZ(vertices: Vec3[], face: number[], rotX: number, rotY: number): number {
  const p0 = rotateX(rotateY(vertices[face[0]!]!, rotY), rotX);
  const p1 = rotateX(rotateY(vertices[face[1]!]!, rotY), rotX);
  const p2 = rotateX(rotateY(vertices[face[2]!]!, rotY), rotX);
  const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
  const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
  return ux * vy - uy * vx; // z-component of cross product (simplified since we only need sign/z)
}

export function expandWireframe3d(el: Wireframe3dElement): DrawElement[] {
  const result: DrawElement[] = [];
  const rotX = degToRad(el.rotationX ?? 20);
  const rotY = degToRad(el.rotationY ?? 30);
  const cx = el.cx;
  const cy = el.cy;
  const size = el.size;
  const color = el.strokeColor ?? el.color ?? '#1f2a44';
  const sw = el.strokeWidth ?? el.stroke_width ?? 1.5;
  const showHidden = el.showHiddenLines ?? false;

  function proj(v: Vec3): Point {
    return project3d(v, cx, cy, size, rotX, rotY);
  }

  function addEdge(idx: number, a: Vec3, b: Vec3, edgeColor?: string): void {
    const pa = proj(a);
    const pb = proj(b);
    result.push({
      id: `${el.id}-edge-${idx}`,
      type: 'line',
      from: pa,
      to: pb,
      color: edgeColor ?? color,
      stroke_width: sw,
    });
  }

  if (el.shape === 'cube') {
    const h = 0.5;
    const verts: Vec3[] = [
      { x: -h, y: -h, z: -h }, { x: h, y: -h, z: -h },
      { x: h, y: h, z: -h },  { x: -h, y: h, z: -h },
      { x: -h, y: -h, z: h },  { x: h, y: -h, z: h },
      { x: h, y: h, z: h },   { x: -h, y: h, z: h },
    ];
    const faces: number[][] = [
      [0, 1, 2, 3], // back
      [4, 5, 6, 7], // front
      [0, 1, 5, 4], // bottom
      [2, 3, 7, 6], // top
      [0, 3, 7, 4], // left
      [1, 2, 6, 5], // right
    ];
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0], // back face
      [4, 5], [5, 6], [6, 7], [7, 4], // front face
      [0, 4], [1, 5], [2, 6], [3, 7], // connecting edges
    ];

    if (showHidden) {
      for (let i = 0; i < edges.length; i++) {
        addEdge(i, verts[edges[i]![0]]!, verts[edges[i]![1]]!);
      }
    } else {
      // Painter's algorithm: draw back-facing edges first, front-facing on top
      const faceDepths = faces.map((f, i) => ({
        face: f,
        idx: i,
        z: avgZ(verts, f, rotX, rotY),
        nz: faceNormalZ(verts, f, rotX, rotY),
      }));
      faceDepths.sort((a, b) => a.z - b.z);

      const drawnEdges = new Set<string>();
      let edgeIdx = 0;
      for (const fd of faceDepths) {
        if (fd.nz <= 0) continue; // back-facing, skip
        const f = fd.face;
        for (let i = 0; i < f.length; i++) {
          const a = f[i]!;
          const b = f[(i + 1) % f.length]!;
          const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
          if (drawnEdges.has(key)) continue;
          drawnEdges.add(key);
          addEdge(edgeIdx++, verts[a]!, verts[b]!);
        }
      }
    }
  } else if (el.shape === 'tetrahedron') {
    const s3 = Math.sqrt(3);
    const verts: Vec3[] = [
      { x: 0, y: 0.612, z: 0 },
      { x: -0.5, y: -0.204, z: s3 / 6 },
      { x: 0.5, y: -0.204, z: s3 / 6 },
      { x: 0, y: -0.204, z: -s3 / 3 },
    ];
    const edges: [number, number][] = [
      [0, 1], [0, 2], [0, 3],
      [1, 2], [1, 3], [2, 3],
    ];
    if (showHidden) {
      for (let i = 0; i < edges.length; i++) {
        addEdge(i, verts[edges[i]![0]]!, verts[edges[i]![1]]!);
      }
    } else {
      const faces: number[][] = [
        [0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3],
      ];
      const faceDepths = faces.map((f, i) => ({
        face: f,
        idx: i,
        z: avgZ(verts, f, rotX, rotY),
        nz: faceNormalZ(verts, f, rotX, rotY),
      }));
      faceDepths.sort((a, b) => a.z - b.z);

      const drawnEdges = new Set<string>();
      let edgeIdx = 0;
      for (const fd of faceDepths) {
        if (fd.nz <= 0) continue;
        const f = fd.face;
        for (let i = 0; i < f.length; i++) {
          const a = f[i]!;
          const b = f[(i + 1) % f.length]!;
          const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
          if (drawnEdges.has(key)) continue;
          drawnEdges.add(key);
          addEdge(edgeIdx++, verts[a]!, verts[b]!);
        }
      }
    }
  } else if (el.shape === 'octahedron') {
    const verts: Vec3[] = [
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: -1, z: 0 },
    ];
    // Scale to half-unit
    for (const v of verts) { v.x *= 0.5; v.y *= 0.5; v.z *= 0.5; }
    const edges: [number, number][] = [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [5, 1], [5, 2], [5, 3], [5, 4],
      [1, 2], [2, 3], [3, 4], [4, 1],
    ];
    if (showHidden) {
      for (let i = 0; i < edges.length; i++) {
        addEdge(i, verts[edges[i]![0]]!, verts[edges[i]![1]]!);
      }
    } else {
      const faces: number[][] = [
        [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
        [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4],
      ];
      const faceDepths = faces.map((f, i) => ({
        face: f,
        idx: i,
        z: avgZ(verts, f, rotX, rotY),
        nz: faceNormalZ(verts, f, rotX, rotY),
      }));
      faceDepths.sort((a, b) => a.z - b.z);

      const drawnEdges = new Set<string>();
      let edgeIdx = 0;
      for (const fd of faceDepths) {
        if (fd.nz <= 0) continue;
        const f = fd.face;
        for (let i = 0; i < f.length; i++) {
          const a = f[i]!;
          const b = f[(i + 1) % f.length]!;
          const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
          if (drawnEdges.has(key)) continue;
          drawnEdges.add(key);
          addEdge(edgeIdx++, verts[a]!, verts[b]!);
        }
      }
    }
  } else if (el.shape === 'axes_3d') {
    const origin: Vec3 = { x: 0, y: 0, z: 0 };
    const xAxis: Vec3 = { x: 1, y: 0, z: 0 };
    const yAxis: Vec3 = { x: 0, y: 1, z: 0 };
    const zAxis: Vec3 = { x: 0, y: 0, z: 1 };
    const axes: Array<{ dir: Vec3; label: string; color: string }> = [
      { dir: xAxis, label: 'x', color: '#dc2626' },
      { dir: yAxis, label: 'y', color: '#16a34a' },
      { dir: zAxis, label: 'z', color: '#2563eb' },
    ];
    for (let i = 0; i < axes.length; i++) {
      const a = axes[i]!;
      const tipP = proj(a.dir);
      const origP = proj(origin);
      result.push({
        id: `${el.id}-axis-${i}`,
        type: 'arrow',
        from: origP,
        to: tipP,
        color: a.color,
        stroke_width: sw,
      });
      // Label slightly past tip
      const labelV: Vec3 = { x: a.dir.x * 1.15, y: a.dir.y * 1.15, z: a.dir.z * 1.15 };
      const labelP = proj(labelV);
      result.push({
        id: `${el.id}-label-${i}`,
        type: 'text',
        x: labelP.x,
        y: labelP.y,
        text: a.label,
        size: 14,
        color: a.color,
      });
    }
  } else if (el.shape === 'surface') {
    const gridN = el.gridN ?? 8;
    const expr = el.expression ?? 'sin(x)*cos(y)';
    const fn = parseMathExpression2Var(expr);
    if (!fn) return result;

    const gridPts: Vec3[][] = [];
    for (let i = 0; i <= gridN; i++) {
      const row: Vec3[] = [];
      for (let j = 0; j <= gridN; j++) {
        const mx = -1 + (2 * i) / gridN;
        const my = -1 + (2 * j) / gridN;
        let mz = fn(mx, my);
        if (!Number.isFinite(mz)) mz = 0;
        row.push({ x: mx, y: mz, z: my });
      }
      gridPts.push(row);
    }

    let edgeIdx = 0;
    // Draw grid lines along rows
    for (let i = 0; i <= gridN; i++) {
      for (let j = 0; j < gridN; j++) {
        addEdge(edgeIdx++, gridPts[i]![j]!, gridPts[i]![j + 1]!);
      }
    }
    // Draw grid lines along columns
    for (let j = 0; j <= gridN; j++) {
      for (let i = 0; i < gridN; i++) {
        addEdge(edgeIdx++, gridPts[i]![j]!, gridPts[i + 1]![j]!);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// sequence_plot: visualize numeric sequences a_n = f(n)
// ---------------------------------------------------------------------------

function expandSequencePlot(el: SequencePlotElement): DrawElement[] {
  const result: DrawElement[] = [];
  const nMin = el.nMin ?? 1;
  const nMax = el.nMax ?? 20;
  const dotRadius = el.dotRadius ?? 4;
  const curveColor = el.strokeColor ?? el.color ?? '#2563eb';
  const showLines = el.showLines ?? false;

  const fn = parseMathExprWithVar(el.expression, 'n');
  if (!fn) return result;

  // Sample sequence values
  const samples: Array<{ n: number; val: number }> = [];
  for (let n = nMin; n <= nMax; n++) {
    try {
      const val = fn(n);
      if (Number.isFinite(val)) samples.push({ n, val });
    } catch { /* skip invalid */ }
  }
  if (samples.length === 0) return result;

  // Determine plot ranges
  const xMin = el.xRange?.[0] ?? nMin - 0.5;
  const xMax = el.xRange?.[1] ?? nMax + 0.5;
  let yMin: number, yMax: number;
  if (el.yRange) {
    [yMin, yMax] = el.yRange;
  } else {
    const vals = samples.map((s) => s.val);
    if (el.limit != null) vals.push(el.limit);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.15, 0.5);
    yMin = lo - pad;
    yMax = hi + pad;
  }

  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin, xMax, yMin, yMax },
  );

  // X-axis line
  const axisY = toCanvasY(0);
  const clampedAxisY = Math.max(el.y, Math.min(el.y + el.height, axisY));
  result.push({
    id: `${el.id}-axis`,
    type: 'line',
    from: { x: el.x, y: clampedAxisY },
    to: { x: el.x + el.width, y: clampedAxisY },
    color: '#94a3b8',
    stroke_width: 1,
  });

  // Tick marks and labels for integer n values
  const tickStep = Math.max(1, Math.ceil((nMax - nMin) / 15));
  for (let n = nMin; n <= nMax; n += tickStep) {
    const cx = toCanvasX(n);
    result.push({
      id: `${el.id}-tick-${n}`,
      type: 'line',
      from: { x: cx, y: clampedAxisY - 4 },
      to: { x: cx, y: clampedAxisY + 4 },
      color: '#94a3b8',
      stroke_width: 1,
    });
    result.push({
      id: `${el.id}-ticklbl-${n}`,
      type: 'text',
      x: cx - 4,
      y: clampedAxisY + 14,
      text: String(n),
      size: 10,
      color: '#64748b',
    });
  }

  // Connecting lines between consecutive dots
  if (showLines && samples.length > 1) {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]!;
      const b = samples[i + 1]!;
      result.push({
        id: `${el.id}-line-${i}`,
        type: 'line',
        from: { x: toCanvasX(a.n), y: toCanvasY(a.val) },
        to: { x: toCanvasX(b.n), y: toCanvasY(b.val) },
        color: curveColor,
        stroke_width: 1,
      });
    }
  }

  // Dots at each (n, a_n) as small ellipses
  for (const s of samples) {
    result.push({
      id: `${el.id}-dot-${s.n}`,
      type: 'ellipse',
      cx: toCanvasX(s.n),
      cy: toCanvasY(s.val),
      rx: dotRadius,
      ry: dotRadius,
      color: curveColor,
    });
  }

  // Limit line (dashed horizontal)
  if (el.limit != null && Number.isFinite(el.limit)) {
    const ly = toCanvasY(el.limit);
    result.push({
      id: `${el.id}-limit`,
      type: 'line',
      from: { x: el.x, y: ly },
      to: { x: el.x + el.width, y: ly },
      color: '#dc2626',
      stroke_width: 1,
      lineStyle: 'dashed',
    });
    result.push({
      id: `${el.id}-limit-label`,
      type: 'text',
      x: el.x + el.width + 4,
      y: ly - 6,
      text: `L = ${el.limit}`,
      size: 12,
      color: '#dc2626',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// bezier_curve: smooth parametric curves via de Casteljau algorithm
// ---------------------------------------------------------------------------

/** Evaluate a Bezier curve at parameter t ∈ [0,1] using de Casteljau. */
function deCasteljau(pts: [number, number][], t: number): [number, number] {
  let work = pts.slice();
  while (work.length > 1) {
    const next: [number, number][] = [];
    for (let i = 0; i < work.length - 1; i++) {
      next.push([
        (1 - t) * work[i]![0] + t * work[i + 1]![0],
        (1 - t) * work[i]![1] + t * work[i + 1]![1],
      ]);
    }
    work = next;
  }
  return work[0]!;
}

function expandBezierCurve(el: BezierCurveElement): DrawElement[] {
  const result: DrawElement[] = [];
  const pts = el.points;
  if (pts.length < 3) return result;

  const curveColor = el.strokeColor ?? el.color ?? '#1f2a44';
  const curveWidth = el.strokeWidth ?? el.stroke_width ?? 1.8;
  const showCP = el.showControlPoints ?? false;
  const showTangents = el.showTangents ?? false;
  const SAMPLES = 80;

  // For polyBezier: split into cubic segments of 4 control points each
  // If exactly 3 or 4, treat as single quadratic/cubic
  const segments: [number, number][][] = [];
  if (pts.length <= 4) {
    segments.push(pts);
  } else {
    // PolyBezier: chunks of 4 (overlap last point)
    for (let i = 0; i + 3 < pts.length; i += 3) {
      segments.push(pts.slice(i, i + 4));
    }
    // If remaining points don't form a complete chunk, use them as last segment
    const lastStart = (segments.length) * 3;
    if (lastStart < pts.length - 1) {
      segments.push(pts.slice(lastStart));
    }
  }

  const samplesPerSeg = Math.max(10, Math.floor(SAMPLES / segments.length));

  // Sample and draw curve segments
  let segIdx = 0;
  for (const seg of segments) {
    for (let i = 0; i < samplesPerSeg; i++) {
      const t0 = i / samplesPerSeg;
      const t1 = (i + 1) / samplesPerSeg;
      const p0 = deCasteljau(seg, t0);
      const p1 = deCasteljau(seg, t1);
      result.push({
        id: `${el.id}-seg${segIdx}-${i}`,
        type: 'line',
        from: { x: p0[0], y: p0[1] },
        to: { x: p1[0], y: p1[1] },
        color: curveColor,
        stroke_width: curveWidth,
      });
    }
    segIdx++;
  }

  // Control polygon and control point dots
  if (showCP) {
    for (let i = 0; i < pts.length - 1; i++) {
      result.push({
        id: `${el.id}-cp-line-${i}`,
        type: 'line',
        from: { x: pts[i]![0], y: pts[i]![1] },
        to: { x: pts[i + 1]![0], y: pts[i + 1]![1] },
        color: '#94a3b8',
        stroke_width: 1,
        lineStyle: 'dashed',
      });
    }
    for (let i = 0; i < pts.length; i++) {
      result.push({
        id: `${el.id}-cp-dot-${i}`,
        type: 'ellipse',
        cx: pts[i]![0],
        cy: pts[i]![1],
        rx: 3,
        ry: 3,
        color: '#94a3b8',
      });
    }
  }

  // Tangent lines at endpoints
  if (showTangents && pts.length >= 2) {
    const tangentLen = 60;
    // Start tangent: direction from pts[0] to pts[1]
    const dx0 = pts[1]![0] - pts[0]![0];
    const dy0 = pts[1]![1] - pts[0]![1];
    const len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
    result.push({
      id: `${el.id}-tangent-start`,
      type: 'line',
      from: { x: pts[0]![0], y: pts[0]![1] },
      to: { x: pts[0]![0] + (dx0 / len0) * tangentLen, y: pts[0]![1] + (dy0 / len0) * tangentLen },
      color: '#16a34a',
      stroke_width: 1,
      lineStyle: 'dashed',
    });
    // End tangent: direction from second-to-last to last
    const last = pts.length - 1;
    const dxN = pts[last]![0] - pts[last - 1]![0];
    const dyN = pts[last]![1] - pts[last - 1]![1];
    const lenN = Math.sqrt(dxN * dxN + dyN * dyN) || 1;
    result.push({
      id: `${el.id}-tangent-end`,
      type: 'line',
      from: { x: pts[last]![0], y: pts[last]![1] },
      to: { x: pts[last]![0] + (dxN / lenN) * tangentLen, y: pts[last]![1] + (dyN / lenN) * tangentLen },
      color: '#16a34a',
      stroke_width: 1,
      lineStyle: 'dashed',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Annotation arrow expansion
// ---------------------------------------------------------------------------

function expandAnnotationArrow(el: AnnotationArrowElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const strokeColor = el.strokeColor ?? el.color ?? '#333';
  const fontSize = el.fontSize ?? 16;

  // Compute bezier control point: midpoint offset perpendicular to the line by 20px
  const mx = (el.labelX + el.targetX) / 2;
  const my = (el.labelY + el.targetY) / 2;
  const dx = el.targetX - el.labelX;
  const dy = el.targetY - el.labelY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular offset direction
  const px = -dy / len * 20;
  const py = dx / len * 20;
  const cpX = mx + px;
  const cpY = my + py;

  // Sample the quadratic bezier to produce line segments for the curved arrow
  const STEPS = 20;
  const pts: Point[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const u = 1 - t;
    pts.push({
      x: u * u * el.labelX + 2 * u * t * cpX + t * t * el.targetX,
      y: u * u * el.labelY + 2 * u * t * cpY + t * t * el.targetY,
    });
  }

  // Draw curve as line segments
  for (let i = 0; i < pts.length - 1; i++) {
    out.push({
      id: `${id}-seg-${i}`,
      type: 'line',
      from: pts[i]!,
      to: pts[i + 1]!,
      color: strokeColor,
    });
  }

  // Arrowhead at the target end
  const lastSeg = pts[pts.length - 1]!;
  const prevSeg = pts[pts.length - 2]!;
  const arrowDx = lastSeg.x - prevSeg.x;
  const arrowDy = lastSeg.y - prevSeg.y;
  const arrowLen = Math.sqrt(arrowDx * arrowDx + arrowDy * arrowDy) || 1;
  const headLen = 10;
  const headAngle = Math.PI / 6;
  const ux = arrowDx / arrowLen;
  const uy = arrowDy / arrowLen;
  const headBase = { x: lastSeg.x - headLen * ux, y: lastSeg.y - headLen * uy };
  const nx = -uy;
  const ny = ux;
  const wing = headLen * Math.tan(headAngle);
  out.push({
    id: `${id}-head-l`,
    type: 'line',
    from: lastSeg,
    to: { x: headBase.x + wing * nx, y: headBase.y + wing * ny },
    color: strokeColor,
  });
  out.push({
    id: `${id}-head-r`,
    type: 'line',
    from: lastSeg,
    to: { x: headBase.x - wing * nx, y: headBase.y - wing * ny },
    color: strokeColor,
  });

  // Text or LaTeX label at the label position
  const useLatex = el.isLatex ?? shouldUseLaTeX(el.text);
  if (useLatex) {
    out.push({
      id: `${id}-label`,
      type: 'latex',
      x: el.labelX,
      y: el.labelY - fontSize,
      tex: el.text,
      fontSize,
      color: strokeColor,
    });
  } else {
    out.push({
      id: `${id}-label`,
      type: 'text',
      x: el.labelX,
      y: el.labelY - fontSize,
      text: el.text,
      size: fontSize,
      color: strokeColor,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Formula box expansion
// ---------------------------------------------------------------------------

function expandFormulaBox(el: FormulaBoxElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const padding = el.padding ?? 12;
  const borderColor = el.borderColor ?? '#333';
  const fillColor = el.fillColor ?? 'rgba(255,255,240,0.95)';
  const formulaFontSize = 20;
  const titleFontSize = 16;

  // Compute auto-dimensions based on formula length
  const autoWidth = el.width ?? Math.max(180, Math.min(800, el.formula.length * formulaFontSize * 0.5 + padding * 2));
  const titleHeight = el.title ? titleFontSize * 1.5 : 0;
  const autoHeight = el.height ?? (formulaFontSize * 2.2 + titleHeight + padding * 2);

  // Rounded rect border box
  out.push({
    id: `${id}-box`,
    type: 'rect',
    x: el.x,
    y: el.y,
    w: autoWidth,
    h: autoHeight,
    color: borderColor,
    fillColor,
  });

  // Optional title text above the formula
  if (el.title) {
    out.push({
      id: `${id}-title`,
      type: 'text',
      x: el.x + padding,
      y: el.y + padding + titleFontSize,
      text: el.title,
      size: titleFontSize,
      color: borderColor,
    });
  }

  // LaTeX formula centered inside the box
  const formulaY = el.y + padding + titleHeight + formulaFontSize * 1.1;
  out.push({
    id: `${id}-formula`,
    type: 'latex',
    x: el.x + autoWidth / 2,
    y: formulaY,
    tex: el.formula,
    fontSize: formulaFontSize,
    displayMode: true,
    align: 'center',
  });

  return out;
}

// ---------------------------------------------------------------------------
// Venn diagram expansion (stub — produces label-only placeholders)
// ---------------------------------------------------------------------------

function expandVennDiagram(el: VennDiagramElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const r = el.radius ?? 80;
  const cx = el.x;
  const cy = el.y;
  const sets = el.sets ?? [];
  const sw = el.stroke_width ?? 2;
  const baseColor = el.color ?? '#1f2a44';

  // Draw circles for each set
  const offsets = sets.length === 3
    ? [{ dx: -r * 0.5, dy: -r * 0.3 }, { dx: r * 0.5, dy: -r * 0.3 }, { dx: 0, dy: r * 0.4 }]
    : [{ dx: -r * 0.4, dy: 0 }, { dx: r * 0.4, dy: 0 }];

  sets.forEach((s, i) => {
    const off = offsets[i] ?? { dx: 0, dy: 0 };
    const sc = cx + off.dx;
    const sy = cy + off.dy;
    const setColor = s.color ?? baseColor;
    out.push({
      id: `${id}-circle-${i}`,
      type: 'ellipse' as const,
      cx: sc,
      cy: sy,
      rx: r,
      ry: r,
      color: setColor,
      stroke_width: sw,
      fillColor: 'transparent',
    });
    out.push({
      id: `${id}-label-${i}`,
      type: 'text' as const,
      x: sc + off.dx * 0.6,
      y: sy + off.dy * 0.6 - 10,
      text: s.label,
      size: 14,
      color: setColor,
    });
  });

  if (el.intersectionLabel) {
    out.push({
      id: `${id}-intersection`,
      type: 'text' as const,
      x: cx,
      y: cy,
      text: el.intersectionLabel,
      size: 12,
      color: baseColor,
    });
  }

  if (el.title) {
    out.push({
      id: `${id}-title`,
      type: 'text' as const,
      x: cx,
      y: cy - r - 30,
      text: el.title,
      size: 16,
      color: baseColor,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Truth table expansion (stub — produces grid of text elements)
// ---------------------------------------------------------------------------

function expandTruthTable(el: TruthTableElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const vars = el.variables ?? [];
  const outputs = el.outputs ?? [];
  const cw = el.cellWidth ?? 60;
  const ch = el.cellHeight ?? 30;
  const headerColor = el.headerColor ?? '#2c3e50';
  const baseColor = el.color ?? '#333';
  const cols = [...vars, ...outputs];

  // Header row
  cols.forEach((col, ci) => {
    out.push({
      id: `${id}-hdr-${ci}`,
      type: 'text' as const,
      x: el.x + ci * cw + cw / 2,
      y: el.y + ch / 2,
      text: col,
      size: 14,
      color: headerColor,
    });
  });

  // Header bottom line
  out.push({
    id: `${id}-hdr-line`,
    type: 'line' as const,
    from: { x: el.x, y: el.y + ch },
    to: { x: el.x + cols.length * cw, y: el.y + ch },
    color: baseColor,
    stroke_width: 1,
  });

  // Generate rows (2^n)
  const nRows = Math.pow(2, vars.length);
  for (let r = 0; r < nRows && r < 32; r++) {
    const rowY = el.y + (r + 1) * ch + ch / 2;
    vars.forEach((_, vi) => {
      const val = (r >> (vars.length - 1 - vi)) & 1;
      out.push({
        id: `${id}-r${r}-c${vi}`,
        type: 'text' as const,
        x: el.x + vi * cw + cw / 2,
        y: rowY,
        text: val ? 'T' : 'F',
        size: 13,
        color: val ? (el.trueColor ?? '#27ae60') : (el.falseColor ?? '#e74c3c'),
      });
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Symbol grid expansion
// ---------------------------------------------------------------------------

function expandSymbolGrid(el: SymbolGridElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const symbols = el.symbols;
  const n = symbols.length;
  if (n === 0) return out;

  const cols = el.columns ?? Math.max(1, Math.round(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const cellW = el.cellWidth ?? 60;
  const cellH = el.cellHeight ?? 50;
  const showNames = el.showNames ?? true;
  const titleFontSize = 14;
  const symbolFontSize = 24;
  const nameFontSize = 10;

  let yOffset = el.y;

  // Optional title
  if (el.title) {
    out.push({
      id: `${id}-title`,
      type: 'text',
      x: el.x + (cols * cellW) / 2,
      y: yOffset + titleFontSize,
      text: el.title,
      size: titleFontSize,
      color: '#333',
    });
    yOffset += titleFontSize * 1.8;
  }

  // Grid cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= n) break;
      const sym = symbols[idx]!;
      const cx = el.x + c * cellW;
      const cy = yOffset + r * cellH;

      // Cell border
      out.push({
        id: `${id}-cell-${idx}`,
        type: 'rect',
        x: cx,
        y: cy,
        w: cellW,
        h: cellH,
        color: '#ccc',
      });

      // LaTeX symbol centered in cell
      out.push({
        id: `${id}-sym-${idx}`,
        type: 'latex',
        x: cx + cellW / 2,
        y: cy + (showNames ? cellH * 0.4 : cellH * 0.5),
        tex: sym.latex,
        fontSize: symbolFontSize,
        displayMode: false,
        align: 'center',
      });

      // Optional name label below the symbol
      if (showNames && sym.name) {
        out.push({
          id: `${id}-name-${idx}`,
          type: 'text',
          x: cx + cellW / 2,
          y: cy + cellH - nameFontSize * 0.4,
          text: sym.name,
          size: nameFontSize,
          color: '#666',
        });
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Equation system expansion
// ---------------------------------------------------------------------------

function expandEquationSystem(el: EquationSystemElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const equations = el.equations;
  if (equations.length === 0) return out;

  const showBrace = el.showBrace ?? true;
  const lineSpacing = el.lineSpacing ?? 35;
  const fontSize = el.fontSize ?? 16;
  const titleFontSize = 14;

  let yOffset = el.y;

  // Optional title
  if (el.title) {
    out.push({
      id: `${id}-title`,
      type: 'text',
      x: el.x,
      y: yOffset + titleFontSize,
      text: el.title,
      size: titleFontSize,
      color: '#333',
    });
    yOffset += titleFontSize * 1.8;
  }

  // Build a single LaTeX element using \left\{ \begin{array}
  if (showBrace) {
    const arrayRows = equations.map((eq) => eq).join(' \\\\ ');
    const tex = `\\left\\{ \\begin{array}{l} ${arrayRows} \\end{array} \\right.`;
    out.push({
      id: `${id}-system`,
      type: 'latex',
      x: el.x,
      y: yOffset + fontSize,
      tex,
      fontSize,
      displayMode: true,
    });
  } else {
    // No brace — just stack equations vertically as individual latex elements
    for (let i = 0; i < equations.length; i++) {
      out.push({
        id: `${id}-eq-${i}`,
        type: 'latex',
        x: el.x,
        y: yOffset + fontSize + i * lineSpacing,
        tex: equations[i]!,
        fontSize,
        displayMode: true,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Comparison chart expansion
// ---------------------------------------------------------------------------

const COMPARISON_CHART_COLORS = ['#4a90d9', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#3498db'];

function expandComparisonChart(el: ComparisonChartElement): DrawElement[] {
  const result: DrawElement[] = [];
  const id = el.id;
  const W = el.width ?? 400;
  const H = el.height ?? 250;
  const horizontal = el.horizontal ?? false;
  const barPadding = el.barPadding ?? 0.2;
  const showValues = el.showValues ?? false;
  const seriesCount = el.series.length;
  const catCount = el.categories.length;
  const showLegend = el.showLegend ?? (seriesCount > 1);

  if (catCount === 0 || seriesCount === 0) return result;

  // Find max value for scaling
  let maxVal = 0;
  for (const s of el.series) {
    for (const v of s.values) {
      if (v > maxVal) maxVal = v;
    }
  }
  maxVal = maxVal * 1.2 || 1;

  if (horizontal) {
    // Horizontal bars: categories along Y, values along X
    const groupHeight = H / catCount;
    const padPx = groupHeight * barPadding;
    const usable = groupHeight - padPx;
    const barH = usable / seriesCount;

    // X-axis (bottom)
    result.push({ id: `${id}-x-axis`, type: 'line', from: { x: el.x, y: el.y + H }, to: { x: el.x + W, y: el.y + H }, color: '#333', stroke_width: 2 });
    // Y-axis (left)
    result.push({ id: `${id}-y-axis`, type: 'line', from: { x: el.x, y: el.y }, to: { x: el.x, y: el.y + H }, color: '#333', stroke_width: 2 });

    for (let ci = 0; ci < catCount; ci++) {
      const groupY = el.y + ci * groupHeight + padPx / 2;
      // Category label
      result.push({ id: `${id}-clbl-${ci}`, type: 'text', x: el.x - 8, y: groupY + usable / 2, text: el.categories[ci]!, size: 11, color: '#333', align: 'right' as const });

      for (let si = 0; si < seriesCount; si++) {
        const val = el.series[si]!.values[ci] ?? 0;
        const barW = maxVal > 0 ? (val / maxVal) * W : 0;
        const by = groupY + si * barH;
        const barColor = el.series[si]!.color ?? COMPARISON_CHART_COLORS[si % COMPARISON_CHART_COLORS.length]!;

        result.push({ id: `${id}-bar-${ci}-${si}`, type: 'rect', x: el.x, y: by, w: Math.max(1, barW), h: Math.max(1, barH - 1), color: barColor, stroke_width: 1 });

        if (showValues) {
          result.push({ id: `${id}-val-${ci}-${si}`, type: 'text', x: el.x + barW + 4, y: by + barH / 2, text: String(val), size: 10, color: '#333' });
        }
      }
    }

    // X-axis ticks
    const tickCount = 5;
    for (let t = 0; t <= tickCount; t++) {
      const tickVal = (maxVal / tickCount) * t;
      const tickX = el.x + (tickVal / maxVal) * W;
      result.push({ id: `${id}-xtick-${t}`, type: 'line', from: { x: tickX, y: el.y + H }, to: { x: tickX, y: el.y + H + 4 }, color: '#333', stroke_width: 1 });
      result.push({ id: `${id}-xtick-lbl-${t}`, type: 'text', x: tickX, y: el.y + H + 14, text: tickVal % 1 === 0 ? String(tickVal) : tickVal.toFixed(1), size: 10, color: '#666' });
    }
  } else {
    // Vertical bars (default)
    const groupWidth = W / catCount;
    const padPx = groupWidth * barPadding;
    const usable = groupWidth - padPx;
    const barW = usable / seriesCount;

    // X-axis
    result.push({ id: `${id}-x-axis`, type: 'line', from: { x: el.x, y: el.y + H }, to: { x: el.x + W, y: el.y + H }, color: '#333', stroke_width: 2 });
    // Y-axis
    result.push({ id: `${id}-y-axis`, type: 'line', from: { x: el.x, y: el.y }, to: { x: el.x, y: el.y + H }, color: '#333', stroke_width: 2 });

    for (let ci = 0; ci < catCount; ci++) {
      const groupX = el.x + ci * groupWidth + padPx / 2;
      // Category label
      result.push({ id: `${id}-clbl-${ci}`, type: 'text', x: groupX + usable / 2, y: el.y + H + 16, text: el.categories[ci]!, size: 11, color: '#333' });

      for (let si = 0; si < seriesCount; si++) {
        const val = el.series[si]!.values[ci] ?? 0;
        const barH = maxVal > 0 ? (val / maxVal) * H : 0;
        const bx = groupX + si * barW;
        const by = el.y + H - barH;
        const barColor = el.series[si]!.color ?? COMPARISON_CHART_COLORS[si % COMPARISON_CHART_COLORS.length]!;

        result.push({ id: `${id}-bar-${ci}-${si}`, type: 'rect', x: bx, y: by, w: Math.max(1, barW - 1), h: Math.max(1, barH), color: barColor, stroke_width: 1 });

        if (showValues) {
          result.push({ id: `${id}-val-${ci}-${si}`, type: 'text', x: bx + barW / 2, y: by - 8, text: String(val), size: 10, color: '#333' });
        }
      }
    }

    // Y-axis ticks
    const tickCount = 5;
    for (let t = 0; t <= tickCount; t++) {
      const tickVal = (maxVal / tickCount) * t;
      const tickY = el.y + H - (tickVal / maxVal) * H;
      result.push({ id: `${id}-ytick-${t}`, type: 'line', from: { x: el.x - 4, y: tickY }, to: { x: el.x, y: tickY }, color: '#333', stroke_width: 1 });
      result.push({ id: `${id}-ytick-lbl-${t}`, type: 'text', x: el.x - 10, y: tickY, text: tickVal % 1 === 0 ? String(tickVal) : tickVal.toFixed(1), size: 10, color: '#666' });
    }
  }

  // Title
  if (el.title) {
    result.push({ id: `${id}-title`, type: 'text', x: el.x + W / 2, y: el.y - 16, text: el.title, size: 16, color: '#333' });
  }

  // Axis labels
  if (el.xLabel) {
    result.push({ id: `${id}-xlabel`, type: 'text', x: el.x + W / 2, y: el.y + H + 34, text: el.xLabel, size: 14, color: '#333' });
  }
  if (el.yLabel) {
    result.push({ id: `${id}-ylabel`, type: 'text', x: el.x - 30, y: el.y + H / 2, text: el.yLabel, size: 14, color: '#333' });
  }

  // Legend
  if (showLegend) {
    const legendX = el.x + W + 10;
    for (let si = 0; si < seriesCount; si++) {
      const s = el.series[si]!;
      const ly = el.y + si * 20;
      const legendColor = s.color ?? COMPARISON_CHART_COLORS[si % COMPARISON_CHART_COLORS.length]!;
      result.push({ id: `${id}-leg-swatch-${si}`, type: 'rect', x: legendX, y: ly, w: 12, h: 12, color: legendColor, stroke_width: 1 });
      result.push({ id: `${id}-leg-lbl-${si}`, type: 'text', x: legendX + 16, y: ly + 6, text: s.name, size: 11, color: '#333' });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Box plot expansion
// ---------------------------------------------------------------------------

function expandBoxPlot(el: BoxPlotElement): DrawElement[] {
  const result: DrawElement[] = [];
  const id = el.id;
  const W = el.width ?? 400;
  const H = el.height ?? 200;
  const groups = el.groups;
  const vertical = (el.orientation ?? 'vertical') === 'vertical';
  const showMean = el.showMean ?? false;

  if (groups.length === 0) return result;

  // Compute global value range across all groups (including outliers)
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (const g of groups) {
    globalMin = Math.min(globalMin, g.min);
    globalMax = Math.max(globalMax, g.max);
    if (g.outliers) {
      for (const o of g.outliers) {
        globalMin = Math.min(globalMin, o);
        globalMax = Math.max(globalMax, o);
      }
    }
  }
  const dataRange = globalMax - globalMin || 1;
  const padding = dataRange * 0.1;
  const rangeMin = globalMin - padding;
  const rangeMax = globalMax + padding;
  const rangeSpan = rangeMax - rangeMin || 1;

  // Axes
  if (vertical) {
    // Y-axis
    result.push({ id: `${id}-y-axis`, type: 'line', from: { x: el.x, y: el.y }, to: { x: el.x, y: el.y + H }, color: '#333', stroke_width: 2 });
    // X-axis
    result.push({ id: `${id}-x-axis`, type: 'line', from: { x: el.x, y: el.y + H }, to: { x: el.x + W, y: el.y + H }, color: '#333', stroke_width: 2 });
  } else {
    // X-axis
    result.push({ id: `${id}-x-axis`, type: 'line', from: { x: el.x, y: el.y + H }, to: { x: el.x + W, y: el.y + H }, color: '#333', stroke_width: 2 });
    // Y-axis
    result.push({ id: `${id}-y-axis`, type: 'line', from: { x: el.x, y: el.y }, to: { x: el.x, y: el.y + H }, color: '#333', stroke_width: 2 });
  }

  // Y-axis ticks (value axis)
  const tickCount = 5;
  for (let t = 0; t <= tickCount; t++) {
    const tickVal = rangeMin + (rangeSpan / tickCount) * t;
    if (vertical) {
      const tickY = el.y + H - ((tickVal - rangeMin) / rangeSpan) * H;
      result.push({ id: `${id}-ytick-${t}`, type: 'line', from: { x: el.x - 4, y: tickY }, to: { x: el.x, y: tickY }, color: '#333', stroke_width: 1 });
      result.push({ id: `${id}-ytick-lbl-${t}`, type: 'text', x: el.x - 10, y: tickY, text: tickVal % 1 === 0 ? String(Math.round(tickVal)) : tickVal.toFixed(1), size: 10, color: '#666' });
    } else {
      const tickX = el.x + ((tickVal - rangeMin) / rangeSpan) * W;
      result.push({ id: `${id}-xtick-${t}`, type: 'line', from: { x: tickX, y: el.y + H }, to: { x: tickX, y: el.y + H + 4 }, color: '#333', stroke_width: 1 });
      result.push({ id: `${id}-xtick-lbl-${t}`, type: 'text', x: tickX, y: el.y + H + 14, text: tickVal % 1 === 0 ? String(Math.round(tickVal)) : tickVal.toFixed(1), size: 10, color: '#666' });
    }
  }

  const groupCount = groups.length;
  const slotSize = vertical ? W / groupCount : H / groupCount;
  const boxThickness = slotSize * 0.5;

  for (let gi = 0; gi < groupCount; gi++) {
    const g = groups[gi]!;
    const defaultColor = g.color ?? '#4a90d9';
    const toVal = (v: number) => (v - rangeMin) / rangeSpan;

    if (vertical) {
      const centerX = el.x + (gi + 0.5) * slotSize;
      const halfBox = boxThickness / 2;

      const yQ1 = el.y + H - toVal(g.q1) * H;
      const yQ3 = el.y + H - toVal(g.q3) * H;
      const yMed = el.y + H - toVal(g.median) * H;
      const yMin = el.y + H - toVal(g.min) * H;
      const yMax = el.y + H - toVal(g.max) * H;

      // Box (Q1 to Q3)
      result.push({ id: `${id}-box-${gi}`, type: 'rect', x: centerX - halfBox, y: yQ3, w: boxThickness, h: yQ1 - yQ3, color: defaultColor, stroke_width: 2 });

      // Median line
      result.push({ id: `${id}-median-${gi}`, type: 'line', from: { x: centerX - halfBox, y: yMed }, to: { x: centerX + halfBox, y: yMed }, color: '#c0392b', stroke_width: 3 });

      // Lower whisker (min to Q1)
      result.push({ id: `${id}-wlo-${gi}`, type: 'line', from: { x: centerX, y: yQ1 }, to: { x: centerX, y: yMin }, color: defaultColor, stroke_width: 1 });
      result.push({ id: `${id}-wlo-cap-${gi}`, type: 'line', from: { x: centerX - halfBox * 0.5, y: yMin }, to: { x: centerX + halfBox * 0.5, y: yMin }, color: defaultColor, stroke_width: 1 });

      // Upper whisker (Q3 to max)
      result.push({ id: `${id}-whi-${gi}`, type: 'line', from: { x: centerX, y: yQ3 }, to: { x: centerX, y: yMax }, color: defaultColor, stroke_width: 1 });
      result.push({ id: `${id}-whi-cap-${gi}`, type: 'line', from: { x: centerX - halfBox * 0.5, y: yMax }, to: { x: centerX + halfBox * 0.5, y: yMax }, color: defaultColor, stroke_width: 1 });

      // Outliers
      if (g.outliers) {
        for (let oi = 0; oi < g.outliers.length; oi++) {
          const oy = el.y + H - toVal(g.outliers[oi]!) * H;
          result.push({ id: `${id}-outlier-${gi}-${oi}`, type: 'ellipse', cx: centerX, cy: oy, rx: 3, ry: 3, color: '#e67e22', stroke_width: 1 });
        }
      }

      // Mean marker
      if (showMean) {
        const mean = (g.min + g.q1 + g.median + g.q3 + g.max) / 5;
        const yMean = el.y + H - toVal(mean) * H;
        result.push({ id: `${id}-mean-${gi}`, type: 'text', x: centerX, y: yMean, text: '×', size: 14, color: '#333' });
      }

      // Group label
      result.push({ id: `${id}-glbl-${gi}`, type: 'text', x: centerX, y: el.y + H + 16, text: g.label, size: 11, color: '#333' });
    } else {
      // Horizontal orientation
      const centerY = el.y + (gi + 0.5) * slotSize;
      const halfBox = boxThickness / 2;

      const xQ1 = el.x + toVal(g.q1) * W;
      const xQ3 = el.x + toVal(g.q3) * W;
      const xMed = el.x + toVal(g.median) * W;
      const xMin = el.x + toVal(g.min) * W;
      const xMax = el.x + toVal(g.max) * W;

      // Box (Q1 to Q3)
      result.push({ id: `${id}-box-${gi}`, type: 'rect', x: xQ1, y: centerY - halfBox, w: xQ3 - xQ1, h: boxThickness, color: defaultColor, stroke_width: 2 });

      // Median line
      result.push({ id: `${id}-median-${gi}`, type: 'line', from: { x: xMed, y: centerY - halfBox }, to: { x: xMed, y: centerY + halfBox }, color: '#c0392b', stroke_width: 3 });

      // Lower whisker
      result.push({ id: `${id}-wlo-${gi}`, type: 'line', from: { x: xMin, y: centerY }, to: { x: xQ1, y: centerY }, color: defaultColor, stroke_width: 1 });
      result.push({ id: `${id}-wlo-cap-${gi}`, type: 'line', from: { x: xMin, y: centerY - halfBox * 0.5 }, to: { x: xMin, y: centerY + halfBox * 0.5 }, color: defaultColor, stroke_width: 1 });

      // Upper whisker
      result.push({ id: `${id}-whi-${gi}`, type: 'line', from: { x: xQ3, y: centerY }, to: { x: xMax, y: centerY }, color: defaultColor, stroke_width: 1 });
      result.push({ id: `${id}-whi-cap-${gi}`, type: 'line', from: { x: xMax, y: centerY - halfBox * 0.5 }, to: { x: xMax, y: centerY + halfBox * 0.5 }, color: defaultColor, stroke_width: 1 });

      // Outliers
      if (g.outliers) {
        for (let oi = 0; oi < g.outliers.length; oi++) {
          const ox = el.x + toVal(g.outliers[oi]!) * W;
          result.push({ id: `${id}-outlier-${gi}-${oi}`, type: 'ellipse', cx: ox, cy: centerY, rx: 3, ry: 3, color: '#e67e22', stroke_width: 1 });
        }
      }

      // Mean marker
      if (showMean) {
        const mean = (g.min + g.q1 + g.median + g.q3 + g.max) / 5;
        const xMean = el.x + toVal(mean) * W;
        result.push({ id: `${id}-mean-${gi}`, type: 'text', x: xMean, y: centerY, text: '×', size: 14, color: '#333' });
      }

      // Group label
      result.push({ id: `${id}-glbl-${gi}`, type: 'text', x: el.x - 8, y: centerY, text: g.label, size: 11, color: '#333', align: 'right' as const });
    }
  }

  // Title
  if (el.title) {
    result.push({ id: `${id}-title`, type: 'text', x: el.x + W / 2, y: el.y - 16, text: el.title, size: 16, color: '#333' });
  }

  // Axis labels
  if (el.xLabel) {
    result.push({ id: `${id}-xlabel`, type: 'text', x: el.x + W / 2, y: el.y + H + 34, text: el.xLabel, size: 14, color: '#333' });
  }
  if (el.yLabel) {
    result.push({ id: `${id}-ylabel`, type: 'text', x: el.x - 30, y: el.y + H / 2, text: el.yLabel, size: 14, color: '#333' });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Polygon expansion
// ---------------------------------------------------------------------------

const DEG_TO_RAD_POLY = Math.PI / 180;

function resolvePolygonVertices(el: PolygonElement): { x: number; y: number }[] {
  if (el.vertices && el.vertices.length >= 3) {
    return el.vertices.map(v => ({ x: v.x, y: v.y }));
  }
  const n = el.sides ?? 5;
  const cx = el.centerX ?? 400;
  const cy = el.centerY ?? 400;
  const r = el.radius ?? 100;
  const rot = (el.rotationDeg ?? 0) * DEG_TO_RAD_POLY;
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const angle = rot + (2 * Math.PI * i) / n - Math.PI / 2;
    verts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return verts;
}

function expandPolygon(el: PolygonElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const verts = resolvePolygonVertices(el);
  const n = verts.length;
  const color = el.strokeColor ?? el.color ?? '#000';
  const sw = el.stroke_width ?? 2;
  const fill = el.fillColor;

  // Centroid for label offset direction
  const cx = verts.reduce((s, v) => s + v.x, 0) / n;
  const cy = verts.reduce((s, v) => s + v.y, 0) / n;

  // Optional fill (translucent rect placeholder – best effort)
  if (fill) {
    const xs = verts.map(v => v.x);
    const ys = verts.map(v => v.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    out.push({
      id: `${id}-fill`,
      type: 'rect' as const,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      color: fill,
      fillColor: fill,
      stroke_width: 0,
    });
  }

  // Edges
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    out.push({
      id: `${id}-edge${i}`,
      type: 'line' as const,
      from: { x: a.x, y: a.y },
      to: { x: b.x, y: b.y },
      color,
      stroke_width: sw,
    });
  }

  // Vertex labels
  if (el.showVertexLabels) {
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < n; i++) {
      const v = verts[i];
      const dx = v.x - cx;
      const dy = v.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const offset = 16;
      out.push({
        id: `${id}-vlabel${i}`,
        type: 'text' as const,
        x: v.x + (dx / dist) * offset,
        y: v.y + (dy / dist) * offset,
        text: labels[i % labels.length],
        size: 14,
        color,
      });
    }
  }

  // Side length labels
  if (el.showSideLabels) {
    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const offset = 14;
      out.push({
        id: `${id}-slabel${i}`,
        type: 'text' as const,
        x: mx + nx * offset,
        y: my + ny * offset,
        text: len.toFixed(1),
        size: 12,
        color,
      });
    }
  }

  // Angle arcs
  if (el.showAngles) {
    for (let i = 0; i < n; i++) {
      const prev = verts[(i - 1 + n) % n];
      const curr = verts[i];
      const next = verts[(i + 1) % n];
      const a1 = Math.atan2(prev.y - curr.y, prev.x - curr.x);
      const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
      let sweep = a2 - a1;
      if (sweep < 0) sweep += 2 * Math.PI;
      if (sweep > Math.PI) sweep = 2 * Math.PI - sweep;
      const arcR = 18;
      const steps = 16;
      let startAngle = a1;
      let endAngle = a1 + sweep;
      // Ensure we draw the interior angle
      const midAngle = (startAngle + endAngle) / 2;
      const testX = curr.x + Math.cos(midAngle);
      const testY = curr.y + Math.sin(midAngle);
      const toCx = cx - curr.x;
      const toCy = cy - curr.y;
      const toTest = testX - curr.x;
      const toTestY = testY - curr.y;
      if (toCx * toTest + toCy * toTestY < 0) {
        startAngle = a2;
        endAngle = a2 + (2 * Math.PI - sweep);
      }
      for (let s = 0; s < steps; s++) {
        const t0 = startAngle + ((endAngle - startAngle) * s) / steps;
        const t1 = startAngle + ((endAngle - startAngle) * (s + 1)) / steps;
        out.push({
          id: `${id}-angle${i}-seg${s}`,
          type: 'line' as const,
          from: { x: curr.x + arcR * Math.cos(t0), y: curr.y + arcR * Math.sin(t0) },
          to: { x: curr.x + arcR * Math.cos(t1), y: curr.y + arcR * Math.sin(t1) },
          color,
          stroke_width: 1,
        });
      }
      const degs = (sweep * 180) / Math.PI;
      const labelAngle = (startAngle + endAngle) / 2;
      out.push({
        id: `${id}-anglelabel${i}`,
        type: 'text' as const,
        x: curr.x + (arcR + 14) * Math.cos(labelAngle),
        y: curr.y + (arcR + 14) * Math.sin(labelAngle),
        text: `${degs.toFixed(0)}°`,
        size: 10,
        color,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Geometric construction expansion
// ---------------------------------------------------------------------------

function expandGeometricConstruction(el: GeometricConstructionElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const color = el.color ?? '#000';
  const sw = el.stroke_width ?? 2;

  // Title
  if (el.title) {
    out.push({
      id: `${id}-title`,
      type: 'text' as const,
      x: el.steps[0]?.x1 ?? 200,
      y: (el.steps[0]?.y1 ?? 200) - 40,
      text: el.title,
      size: 18,
      color,
    });
  }

  for (let i = 0; i < el.steps.length; i++) {
    const step = el.steps[i];
    const sid = `${id}-step${i}`;
    const stepColor = step.color ?? color;
    const stepSw = sw;

    switch (step.type) {
      case 'point': {
        const r = 3;
        const px = step.x ?? step.x1 ?? 0;
        const py = step.y ?? step.y1 ?? 0;
        out.push({
          id: `${sid}-dot`,
          type: 'ellipse' as const,
          cx: px,
          cy: py,
          rx: r,
          ry: r,
          color: stepColor,
          fillColor: stepColor,
          stroke_width: 1,
        });
        if (step.label) {
          out.push({
            id: `${sid}-label`,
            type: 'text' as const,
            x: px + 8,
            y: py - 8,
            text: step.label,
            size: 14,
            color: stepColor,
          });
        }
        break;
      }
      case 'line': {
        out.push({
          id: sid,
          type: 'line' as const,
          from: { x: step.x1 ?? 0, y: step.y1 ?? 0 },
          to: { x: step.x2 ?? 0, y: step.y2 ?? 0 },
          color: stepColor,
          stroke_width: stepSw,
        });
        if (step.ticks && step.ticks > 0) {
          const mx = ((step.x1 ?? 0) + (step.x2 ?? 0)) / 2;
          const my = ((step.y1 ?? 0) + (step.y2 ?? 0)) / 2;
          const dx = (step.x2 ?? 0) - (step.x1 ?? 0);
          const dy = (step.y2 ?? 0) - (step.y1 ?? 0);
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const tickLen = 8;
          const spacing = 5;
          const tickCount = step.ticks;
          for (let t = 0; t < tickCount; t++) {
            const offset = (t - (tickCount - 1) / 2) * spacing;
            const tx = mx + (dx / len) * offset;
            const ty = my + (dy / len) * offset;
            out.push({
              id: `${sid}-tick${t}`,
              type: 'line' as const,
              from: { x: tx - nx * tickLen, y: ty - ny * tickLen },
              to: { x: tx + nx * tickLen, y: ty + ny * tickLen },
              color: stepColor,
              stroke_width: 1,
            });
          }
        }
        if (step.label) {
          const mx = ((step.x1 ?? 0) + (step.x2 ?? 0)) / 2;
          const my = ((step.y1 ?? 0) + (step.y2 ?? 0)) / 2;
          out.push({
            id: `${sid}-label`,
            type: 'text' as const,
            x: mx + 8,
            y: my - 8,
            text: step.label,
            size: 12,
            color: stepColor,
          });
        }
        break;
      }
      case 'circle': {
        const r = step.r ?? 50;
        const ccx = step.cx ?? step.x1 ?? 0;
        const ccy = step.cy ?? step.y1 ?? 0;
        out.push({
          id: sid,
          type: 'ellipse' as const,
          cx: ccx,
          cy: ccy,
          rx: r,
          ry: r,
          color: stepColor,
          stroke_width: stepSw,
        });
        if (step.label) {
          out.push({
            id: `${sid}-label`,
            type: 'text' as const,
            x: ccx + r + 8,
            y: ccy,
            text: step.label,
            size: 12,
            color: stepColor,
          });
        }
        break;
      }
      case 'arc': {
        const r = step.r ?? 50;
        const acx = step.cx ?? step.x1 ?? 0;
        const acy = step.cy ?? step.y1 ?? 0;
        const start = (step.startAngle ?? 0) * DEG_TO_RAD_POLY;
        const end = (step.endAngle ?? 180) * DEG_TO_RAD_POLY;
        const segments = 24;
        for (let s = 0; s < segments; s++) {
          const t0 = start + ((end - start) * s) / segments;
          const t1 = start + ((end - start) * (s + 1)) / segments;
          out.push({
            id: `${sid}-seg${s}`,
            type: 'line' as const,
            from: { x: acx + r * Math.cos(t0), y: acy + r * Math.sin(t0) },
            to: { x: acx + r * Math.cos(t1), y: acy + r * Math.sin(t1) },
            color: stepColor,
            stroke_width: stepSw,
          });
        }
        break;
      }
      case 'angle_bisector': {
        const ax1 = step.x1 ?? 0;
        const ay1 = step.y1 ?? 0;
        if (step.x2 != null && step.y2 != null) {
          out.push({
            id: sid,
            type: 'line' as const,
            from: { x: ax1, y: ay1 },
            to: { x: step.x2, y: step.y2 },
            color: stepColor,
            stroke_width: stepSw,
            lineStyle: 'dashed' as const,
          });
        }
        if (step.label) {
          const lx = step.x2 != null ? (ax1 + step.x2) / 2 : ax1;
          const ly = step.y2 != null ? (ay1 + step.y2) / 2 : ay1;
          out.push({
            id: `${sid}-label`,
            type: 'text' as const,
            x: lx + 8,
            y: ly - 8,
            text: step.label,
            size: 12,
            color: stepColor,
          });
        }
        break;
      }
      case 'perpendicular': {
        const px1 = step.x1 ?? 0;
        const py1 = step.y1 ?? 0;
        if (step.x2 != null && step.y2 != null) {
          out.push({
            id: sid,
            type: 'line' as const,
            from: { x: px1, y: py1 },
            to: { x: step.x2, y: step.y2 },
            color: stepColor,
            stroke_width: stepSw,
            lineStyle: 'dashed' as const,
          });
          const dx = step.x2 - px1;
          const dy = step.y2 - py1;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const markSize = 10;
          out.push({
            id: `${sid}-rmark0`,
            type: 'line' as const,
            from: { x: px1 + ux * markSize, y: py1 + uy * markSize },
            to: { x: px1 + ux * markSize - uy * markSize, y: py1 + uy * markSize + ux * markSize },
            color: stepColor,
            stroke_width: 1,
          });
          out.push({
            id: `${sid}-rmark1`,
            type: 'line' as const,
            from: { x: px1 - uy * markSize, y: py1 + ux * markSize },
            to: { x: px1 + ux * markSize - uy * markSize, y: py1 + uy * markSize + ux * markSize },
            color: stepColor,
            stroke_width: 1,
          });
        }
        if (step.label) {
          out.push({
            id: `${sid}-label`,
            type: 'text' as const,
            x: px1 + 8,
            y: py1 - 8,
            text: step.label,
            size: 12,
            color: stepColor,
          });
        }
        break;
      }
    }
  }

  return out;
}

function expandMathPrimitives(elements: DrawElement[], theme?: ColorTheme): DrawElement[] {
  const result: DrawElement[] = [];
  let curveIndex = 0;
  for (const el of elements) {
    if (el.type === 'function_curve') {
      if (theme && !el.color) {
        el.color = getCurveColor(theme, curveIndex++);
      }
      result.push(...expandFunctionCurve(el, theme));
    } else if (el.type === 'angle_arc') {
      result.push(...expandAngleArc(el));
    } else if (el.type === 'integral_region') {
      result.push(...expandIntegralRegion(el, theme));
    } else if (el.type === 'cartesian_axes') {
      result.push(...expandCartesianAxes(el, theme));
    } else if (el.type === 'number_line') {
      result.push(...expandNumberLine(el, theme));
    } else if (el.type === 'vector_arrow') {
      result.push(...expandVectorArrow(el));
    } else if (el.type === 'circle_with_radius') {
      result.push(...expandCircleWithRadius(el));
    } else if (el.type === 'triangle_with_angles') {
      result.push(...expandTriangleWithAngles(el));
    } else if (el.type === 'parametric_curve') {
      if (theme && !el.color) {
        el.color = getCurveColor(theme, curveIndex++);
      }
      result.push(...expandParametricCurve(el, theme));
    } else if (el.type === 'polar_plot') {
      result.push(...expandPolarPlot(el, theme));
    } else if (el.type === 'riemann_sum') {
      result.push(...expandRiemannSum(el));
    } else if (el.type === 'tangent_line') {
      result.push(...expandTangentLine(el));
    } else if (el.type === 'matrix_bracket') {
      result.push(...expandMatrixBracket(el));
    } else if (el.type === 'linear_transform') {
      result.push(...expandLinearTransform(el, theme));
    } else if (el.type === 'histogram') {
      result.push(...expandHistogram(el, theme));
    } else if (el.type === 'normal_distribution') {
      result.push(...expandNormalDistribution(el, theme));
    } else if (el.type === 'slope_field') {
      result.push(...expandSlopeField(el));
    } else if (el.type === 'vector_field_2d') {
      result.push(...expandVectorField2d(el));
    } else if (el.type === 'wireframe_3d') {
      result.push(...expandWireframe3d(el));
    } else if (el.type === 'sequence_plot') {
      result.push(...expandSequencePlot(el));
    } else if (el.type === 'bezier_curve') {
      result.push(...expandBezierCurve(el));
    } else if (el.type === 'complex_plane') {
      result.push(...expandComplexPlane(el, theme));
    } else if (el.type === 'number_theory_grid') {
      result.push(...expandNumberTheoryGrid(el));
    } else if (el.type === 'annotation_arrow') {
      result.push(...expandAnnotationArrow(el));
    } else if (el.type === 'formula_box') {
      result.push(...expandFormulaBox(el));
    } else if (el.type === 'venn_diagram') {
      result.push(...expandVennDiagram(el));
    } else if (el.type === 'truth_table') {
      result.push(...expandTruthTable(el));
    } else if (el.type === 'conic_section') {
      result.push(...expandConicSection(el));
    } else if (el.type === 'coordinate_grid') {
      result.push(...expandCoordinateGrid(el));
    } else if (el.type === 'symbol_grid') {
      result.push(...expandSymbolGrid(el));
    } else if (el.type === 'equation_system') {
      result.push(...expandEquationSystem(el));
    } else if (el.type === 'comparison_chart') {
      result.push(...expandComparisonChart(el));
    } else if (el.type === 'box_plot') {
      result.push(...expandBoxPlot(el));
    } else if (el.type === 'polygon') {
      result.push(...expandPolygon(el));
    } else if (el.type === 'geometric_construction') {
      result.push(...expandGeometricConstruction(el));
    } else if (el.type === 'interval_diagram') {
      result.push(...expandIntervalDiagram(el, theme));
    } else {
      result.push(el);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Complex plane expansion
// ---------------------------------------------------------------------------

function expandComplexPlane(el: ComplexPlaneElement, theme?: ColorTheme): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const [xMin, xMax] = el.xRange ?? [-2, 2];
  const [yMin, yMax] = el.yRange ?? [-2, 2];
  const axisColor = el.strokeColor ?? (theme ? getThemeColors(theme).axis : '#1f2a44');
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  // Default canvas region: 400×400 centered at 700,350
  const W = 400, H = 400;
  const canvasX = 500, canvasY = 150;

  const toX = (re: number) => canvasX + (re - xMin) / xSpan * W;
  const toY = (im: number) => canvasY + H - (im - yMin) / ySpan * H;

  // Re axis (horizontal arrow)
  out.push({
    id: `${id}-re-axis`,
    type: 'arrow',
    from: { x: canvasX, y: toY(0) },
    to: { x: canvasX + W, y: toY(0) },
    color: axisColor,
  });

  // Im axis (vertical arrow)
  out.push({
    id: `${id}-im-axis`,
    type: 'arrow',
    from: { x: toX(0), y: canvasY + H },
    to: { x: toX(0), y: canvasY },
    color: axisColor,
  });

  // Axis labels
  out.push({
    id: `${id}-re-label`,
    type: 'text',
    x: canvasX + W + 5,
    y: toY(0) - 6,
    text: 'Re',
    size: 14,
    color: axisColor,
  });
  out.push({
    id: `${id}-im-label`,
    type: 'text',
    x: toX(0) + 5,
    y: canvasY - 5,
    text: 'Im',
    size: 14,
    color: axisColor,
  });

  // Unit circle
  if (el.showUnitCircle) {
    const ucRadius = (1 / xSpan) * W;
    out.push({
      id: `${id}-unit-circle`,
      type: 'ellipse',
      cx: toX(0),
      cy: toY(0),
      rx: ucRadius,
      ry: (1 / ySpan) * H,
      color: axisColor,
      lineStyle: 'dashed' as const,
    });
  }

  // Points
  if (el.points) {
    for (let i = 0; i < el.points.length; i++) {
      const p = el.points[i]!;
      const cx = toX(p.re);
      const cy = toY(p.im);
      const dotColor = p.color ?? getCurveColor(theme ?? 'default', i);
      out.push({
        id: `${id}-pt-${i}`,
        type: 'ellipse',
        cx,
        cy,
        rx: 4,
        ry: 4,
        color: dotColor,
      });
      if (p.label) {
        out.push({
          id: `${id}-pt-${i}-label`,
          type: 'text',
          x: cx + 6,
          y: cy - 6,
          text: p.label,
          size: 12,
          color: dotColor,
        });
      }
    }
  }

  // Vectors
  if (el.vectors) {
    for (let i = 0; i < el.vectors.length; i++) {
      const v = el.vectors[i]!;
      const vColor = v.color ?? getCurveColor(theme ?? 'default', i);
      out.push({
        id: `${id}-vec-${i}`,
        type: 'arrow',
        from: { x: toX(0), y: toY(0) },
        to: { x: toX(v.re), y: toY(v.im) },
        color: vColor,
      });
      if (v.label) {
        out.push({
          id: `${id}-vec-${i}-label`,
          type: 'text',
          x: toX(v.re) + 6,
          y: toY(v.im) - 6,
          text: v.label,
          size: 12,
          color: vColor,
        });
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Number theory grid expansion
// ---------------------------------------------------------------------------

function expandNumberTheoryGrid(el: NumberTheoryGridElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const n = Math.min(el.n, 20);
  const cellSize = el.cellSize ?? 20;
  const totalW = n * cellSize;
  const totalH = n * cellSize;
  const originX = el.cx - totalW / 2;
  const originY = el.cy - totalH / 2;
  const defaultColor = '#ddd';

  // Build highlight lookup
  const hlMap = new Map<string, { color?: string; label?: string }>();
  for (const h of el.highlights) {
    hlMap.set(`${h.i},${h.j}`, h);
  }

  // Draw n×n grid of rects
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = originX + j * cellSize;
      const y = originY + i * cellSize;
      const hl = hlMap.get(`${i},${j}`);
      out.push({
        id: `${id}-cell-${i}-${j}`,
        type: 'rect',
        x,
        y,
        w: cellSize,
        h: cellSize,
        color: hl?.color ?? defaultColor,
      });
      if (hl?.label) {
        out.push({
          id: `${id}-cell-${i}-${j}-lbl`,
          type: 'text',
          x: x + cellSize / 2 - 4,
          y: y + cellSize / 2 - 6,
          text: hl.label,
          size: Math.max(8, cellSize * 0.5),
        });
      }
    }
  }

  // Connection lines (i*j ≡ 0 mod modulus)
  if (el.showConnections) {
    const modulus = el.modulus ?? n;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if ((i * j) % modulus === 0) {
          out.push({
            id: `${id}-conn-${i}-${j}`,
            type: 'line',
            from: {
              x: originX + i * cellSize + cellSize / 2,
              y: originY,
            },
            to: {
              x: originX + j * cellSize + cellSize / 2,
              y: originY,
            },
            color: '#4a90d9',
            lineStyle: 'dashed' as const,
          });
        }
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Conic section expansion
// ---------------------------------------------------------------------------

function expandConicSection(el: ConicSectionElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const scale = el.scale ?? 1;
  const curveColor = el.strokeColor ?? el.color ?? '#1f2a44';
  const sw = el.stroke_width ?? 2;
  const showFoci = el.showFoci !== false;
  const showVertices = el.showVertices !== false;
  const showEquation = el.showEquation !== false;
  const steps = 200;

  // Convert math coordinates to canvas pixels
  const cx = el.x;
  const cy = el.y;
  const toCanvas = (mx: number, my: number): Point => ({
    x: cx + mx * scale,
    y: cy - my * scale, // canvas y is inverted
  });

  if (el.conicType === 'ellipse') {
    const a = (el.a ?? 100) * scale;
    const b = (el.b ?? 60) * scale;
    const c = Math.sqrt(Math.abs(a * a - b * b));

    // Parametric ellipse
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * 2 * Math.PI;
      const t1 = ((i + 1) / steps) * 2 * Math.PI;
      out.push({
        id: `${id}-seg-${i}`,
        type: 'line',
        from: { x: cx + a * Math.cos(t0), y: cy - b * Math.sin(t0) },
        to: { x: cx + a * Math.cos(t1), y: cy - b * Math.sin(t1) },
        color: curveColor,
        stroke_width: sw,
      });
    }

    // Foci at (±c, 0) relative to center
    if (showFoci) {
      const fociColor = '#dc2626';
      for (const sign of [-1, 1]) {
        out.push({
          id: `${id}-focus-${sign > 0 ? 'p' : 'n'}`,
          type: 'ellipse',
          cx: cx + sign * c,
          cy,
          rx: 4,
          ry: 4,
          color: fociColor,
          fillColor: fociColor,
        });
        out.push({
          id: `${id}-focus-${sign > 0 ? 'p' : 'n'}-label`,
          type: 'text',
          x: cx + sign * c,
          y: cy + 12,
          text: `F${sign > 0 ? '₂' : '₁'}`,
          size: 12,
          color: fociColor,
        });
      }
    }

    // Vertices at (±a, 0)
    if (showVertices) {
      for (const sign of [-1, 1]) {
        out.push({
          id: `${id}-vertex-${sign > 0 ? 'p' : 'n'}`,
          type: 'ellipse',
          cx: cx + sign * a,
          cy,
          rx: 3,
          ry: 3,
          color: curveColor,
          fillColor: curveColor,
        });
      }
    }

    if (showEquation) {
      const aVal = el.a ?? 100;
      const bVal = el.b ?? 60;
      out.push({
        id: `${id}-equation`,
        type: 'latex',
        x: cx - a,
        y: cy + b + 20,
        tex: `\\frac{x^2}{${aVal}^2}+\\frac{y^2}{${bVal}^2}=1`,
        fontSize: 16,
      });
    }
  } else if (el.conicType === 'hyperbola') {
    const a = (el.a ?? 100) * scale;
    const b = (el.b ?? 60) * scale;
    const c = Math.sqrt(a * a + b * b);
    const showAsymptotes = el.showAsymptotes !== false;
    const tRange = 2.5;

    // Right branch: (a·cosh(t), b·sinh(t))
    for (let i = 0; i < steps; i++) {
      const t0 = -tRange + (i / steps) * 2 * tRange;
      const t1 = -tRange + ((i + 1) / steps) * 2 * tRange;
      out.push({
        id: `${id}-right-${i}`,
        type: 'line',
        from: { x: cx + a * Math.cosh(t0), y: cy - b * Math.sinh(t0) },
        to: { x: cx + a * Math.cosh(t1), y: cy - b * Math.sinh(t1) },
        color: curveColor,
        stroke_width: sw,
      });
    }

    // Left branch: (-a·cosh(t), b·sinh(t))
    for (let i = 0; i < steps; i++) {
      const t0 = -tRange + (i / steps) * 2 * tRange;
      const t1 = -tRange + ((i + 1) / steps) * 2 * tRange;
      out.push({
        id: `${id}-left-${i}`,
        type: 'line',
        from: { x: cx - a * Math.cosh(t0), y: cy - b * Math.sinh(t0) },
        to: { x: cx - a * Math.cosh(t1), y: cy - b * Math.sinh(t1) },
        color: curveColor,
        stroke_width: sw,
      });
    }

    // Asymptotes y = ±(b/a)x
    if (showAsymptotes) {
      const extent = Math.max(a, b) * 2;
      const asymColor = '#6b7280';
      out.push({
        id: `${id}-asym-pos`,
        type: 'line',
        from: { x: cx - extent, y: cy + (b / a) * extent },
        to: { x: cx + extent, y: cy - (b / a) * extent },
        color: asymColor,
        stroke_width: 1,
        lineStyle: 'dashed' as const,
      });
      out.push({
        id: `${id}-asym-neg`,
        type: 'line',
        from: { x: cx - extent, y: cy - (b / a) * extent },
        to: { x: cx + extent, y: cy + (b / a) * extent },
        color: asymColor,
        stroke_width: 1,
        lineStyle: 'dashed' as const,
      });
    }

    // Foci at (±c, 0)
    if (showFoci) {
      const fociColor = '#dc2626';
      for (const sign of [-1, 1]) {
        out.push({
          id: `${id}-focus-${sign > 0 ? 'p' : 'n'}`,
          type: 'ellipse',
          cx: cx + sign * c,
          cy,
          rx: 4,
          ry: 4,
          color: fociColor,
          fillColor: fociColor,
        });
        out.push({
          id: `${id}-focus-${sign > 0 ? 'p' : 'n'}-label`,
          type: 'text',
          x: cx + sign * c,
          y: cy + 12,
          text: `F${sign > 0 ? '₂' : '₁'}`,
          size: 12,
          color: fociColor,
        });
      }
    }

    // Vertices at (±a, 0)
    if (showVertices) {
      for (const sign of [-1, 1]) {
        out.push({
          id: `${id}-vertex-${sign > 0 ? 'p' : 'n'}`,
          type: 'ellipse',
          cx: cx + sign * a,
          cy,
          rx: 3,
          ry: 3,
          color: curveColor,
          fillColor: curveColor,
        });
      }
    }

    if (showEquation) {
      const aVal = el.a ?? 100;
      const bVal = el.b ?? 60;
      out.push({
        id: `${id}-equation`,
        type: 'latex',
        x: cx - a,
        y: cy + b + 20,
        tex: `\\frac{x^2}{${aVal}^2}-\\frac{y^2}{${bVal}^2}=1`,
        fontSize: 16,
      });
    }
  } else if (el.conicType === 'parabola') {
    const p = (el.p ?? 40) * scale;
    const horizontal = el.horizontal ?? false;
    const showDirectrix = el.showDirectrix !== false;
    const tRange = Math.sqrt(4 * p * 300);

    // Parametric parabola
    for (let i = 0; i < steps; i++) {
      const t0 = -tRange + (i / steps) * 2 * tRange;
      const t1 = -tRange + ((i + 1) / steps) * 2 * tRange;
      let from: Point, to: Point;
      if (horizontal) {
        // y² = 4px → x = t²/(4p), y = t
        from = { x: cx + (t0 * t0) / (4 * p), y: cy - t0 };
        to = { x: cx + (t1 * t1) / (4 * p), y: cy - t1 };
      } else {
        // x² = 4py → x = t, y = t²/(4p)
        from = { x: cx + t0, y: cy - (t0 * t0) / (4 * p) };
        to = { x: cx + t1, y: cy - (t1 * t1) / (4 * p) };
      }
      out.push({
        id: `${id}-seg-${i}`,
        type: 'line',
        from,
        to,
        color: curveColor,
        stroke_width: sw,
      });
    }

    // Focus
    if (showFoci) {
      const fociColor = '#dc2626';
      const focusPos = horizontal
        ? { x: cx + p, y: cy }
        : { x: cx, y: cy - p };
      out.push({
        id: `${id}-focus`,
        type: 'ellipse',
        cx: focusPos.x,
        cy: focusPos.y,
        rx: 4,
        ry: 4,
        color: fociColor,
        fillColor: fociColor,
      });
      out.push({
        id: `${id}-focus-label`,
        type: 'text',
        x: focusPos.x + 8,
        y: focusPos.y - 8,
        text: 'F',
        size: 12,
        color: fociColor,
      });
    }

    // Vertex at origin (already at cx, cy)
    if (showVertices) {
      out.push({
        id: `${id}-vertex`,
        type: 'ellipse',
        cx,
        cy,
        rx: 3,
        ry: 3,
        color: curveColor,
        fillColor: curveColor,
      });
    }

    // Directrix
    if (showDirectrix) {
      const dirColor = '#6b7280';
      if (horizontal) {
        // x = -p
        out.push({
          id: `${id}-directrix`,
          type: 'line',
          from: { x: cx - p, y: cy - tRange },
          to: { x: cx - p, y: cy + tRange },
          color: dirColor,
          stroke_width: 1,
          lineStyle: 'dashed' as const,
        });
      } else {
        // y = -p (canvas: cy + p)
        out.push({
          id: `${id}-directrix`,
          type: 'line',
          from: { x: cx - tRange, y: cy + p },
          to: { x: cx + tRange, y: cy + p },
          color: dirColor,
          stroke_width: 1,
          lineStyle: 'dashed' as const,
        });
      }
    }

    if (showEquation) {
      const pVal = el.p ?? 40;
      const tex = horizontal
        ? `y^2 = ${4 * pVal}x`
        : `x^2 = ${4 * pVal}y`;
      out.push({
        id: `${id}-equation`,
        type: 'latex',
        x: cx + 20,
        y: cy + tRange * 0.3 + 20,
        tex,
        fontSize: 16,
      });
    }
  }

  // Optional label
  if (el.label) {
    out.push({
      id: `${id}-label`,
      type: 'text',
      x: cx,
      y: cy - ((el.b ?? 60) * scale) - 20,
      text: el.label,
      size: 14,
      color: curveColor,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Coordinate grid expansion
// ---------------------------------------------------------------------------

function expandCoordinateGrid(el: CoordinateGridElement): DrawElement[] {
  const out: DrawElement[] = [];
  const id = el.id;
  const width = el.width ?? 600;
  const height = el.height ?? 400;
  const majorSpacing = el.majorSpacing ?? 50;
  const minorSpacing = el.minorSpacing ?? 10;
  const majorColor = el.majorColor ?? 'rgba(0,0,0,0.2)';
  const minorColor = el.minorColor ?? 'rgba(0,0,0,0.08)';
  const showAxes = el.showAxes !== false;
  const showLabels = el.showLabels !== false;
  const originX = el.x;
  const originY = el.y;

  // Minor gridlines
  let idx = 0;
  for (let px = 0; px <= width; px += minorSpacing) {
    out.push({
      id: `${id}-minor-v-${idx}`,
      type: 'line',
      from: { x: originX + px, y: originY },
      to: { x: originX + px, y: originY + height },
      color: minorColor,
      stroke_width: 0.5,
    });
    idx++;
  }
  idx = 0;
  for (let py = 0; py <= height; py += minorSpacing) {
    out.push({
      id: `${id}-minor-h-${idx}`,
      type: 'line',
      from: { x: originX, y: originY + py },
      to: { x: originX + width, y: originY + py },
      color: minorColor,
      stroke_width: 0.5,
    });
    idx++;
  }

  // Major gridlines
  idx = 0;
  for (let px = 0; px <= width; px += majorSpacing) {
    out.push({
      id: `${id}-major-v-${idx}`,
      type: 'line',
      from: { x: originX + px, y: originY },
      to: { x: originX + px, y: originY + height },
      color: majorColor,
      stroke_width: 1,
    });
    idx++;
  }
  idx = 0;
  for (let py = 0; py <= height; py += majorSpacing) {
    out.push({
      id: `${id}-major-h-${idx}`,
      type: 'line',
      from: { x: originX, y: originY + py },
      to: { x: originX + width, y: originY + py },
      color: majorColor,
      stroke_width: 1,
    });
    idx++;
  }

  // Bold axis lines
  if (showAxes) {
    const axisColor = 'rgba(0,0,0,0.6)';
    // Determine axis positions based on math range or default to center
    const xMin = el.xMin ?? 0;
    const xMax = el.xMax ?? (width / majorSpacing);
    const yMin = el.yMin ?? 0;
    const yMax = el.yMax ?? (height / majorSpacing);
    const xSpan = xMax - xMin || 1;
    const ySpan = yMax - yMin || 1;
    const axisXPx = originX + (-xMin / xSpan) * width;
    const axisYPx = originY + (yMax / ySpan) * height;

    // Only draw axes if they fall within the grid bounds
    if (axisXPx >= originX && axisXPx <= originX + width) {
      out.push({
        id: `${id}-y-axis`,
        type: 'line',
        from: { x: axisXPx, y: originY },
        to: { x: axisXPx, y: originY + height },
        color: axisColor,
        stroke_width: 2,
      });
    }
    if (axisYPx >= originY && axisYPx <= originY + height) {
      out.push({
        id: `${id}-x-axis`,
        type: 'line',
        from: { x: originX, y: axisYPx },
        to: { x: originX + width, y: axisYPx },
        color: axisColor,
        stroke_width: 2,
      });
    }
  }

  // Numeric labels at major gridline intersections
  if (showLabels) {
    const xMin = el.xMin;
    const xMax = el.xMax;
    const yMin = el.yMin;
    const yMax = el.yMax;
    const labelColor = 'rgba(0,0,0,0.5)';

    if (xMin != null && xMax != null && yMin != null && yMax != null) {
      const xSpan = xMax - xMin || 1;
      const ySpan = yMax - yMin || 1;
      const mathMajorX = (majorSpacing / width) * xSpan;
      const mathMajorY = (majorSpacing / height) * ySpan;

      idx = 0;
      for (let px = 0; px <= width; px += majorSpacing) {
        const val = xMin + (px / width) * xSpan;
        out.push({
          id: `${id}-xlabel-${idx}`,
          type: 'text',
          x: originX + px,
          y: originY + height + 14,
          text: formatTickLabel(val),
          size: 10,
          color: labelColor,
          align: 'center' as const,
        });
        idx++;
      }
      idx = 0;
      for (let py = 0; py <= height; py += majorSpacing) {
        const val = yMax - (py / height) * ySpan;
        out.push({
          id: `${id}-ylabel-${idx}`,
          type: 'text',
          x: originX - 8,
          y: originY + py - 4,
          text: formatTickLabel(val),
          size: 10,
          color: labelColor,
          align: 'right' as const,
        });
        idx++;
      }
    } else {
      // Pixel-based labels
      idx = 0;
      for (let px = 0; px <= width; px += majorSpacing) {
        out.push({
          id: `${id}-xlabel-${idx}`,
          type: 'text',
          x: originX + px,
          y: originY + height + 14,
          text: String(Math.round(px)),
          size: 10,
          color: labelColor,
          align: 'center' as const,
        });
        idx++;
      }
      idx = 0;
      for (let py = 0; py <= height; py += majorSpacing) {
        out.push({
          id: `${id}-ylabel-${idx}`,
          type: 'text',
          x: originX - 8,
          y: originY + py - 4,
          text: String(Math.round(py)),
          size: 10,
          color: labelColor,
          align: 'right' as const,
        });
        idx++;
      }
    }
  }

  return out;
}
export function lowerMathPrimitive(
  el: CartesianAxesElement | NumberLineElement | VectorArrowElement | FunctionCurveElement | AngleArcElement | IntegralRegionElement | CircleWithRadiusElement | TriangleWithAnglesElement | ParametricCurveElement | PolarPlotElement | RiemannSumElement | TangentLineElement | MatrixBracketElement | LinearTransformElement | HistogramElement | NormalDistributionCurveElement | SlopeFieldElement | VectorField2dElement | Wireframe3dElement | SequencePlotElement | BezierCurveElement | ComplexPlaneElement | NumberTheoryGridElement | AnnotationArrowElement | FormulaBoxElement | VennDiagramElement | TruthTableElement | ConicSectionElement | CoordinateGridElement | ProbabilityTreeElement | ScatterPlotElement | SymbolGridElement | EquationSystemElement | ComparisonChartElement | BoxPlotElement | PolygonElement | GeometricConstructionElement | IntervalDiagramElement,
  theme?: ColorTheme,
): DrawElement[] {
  switch (el.type) {
    case 'cartesian_axes':
      return expandCartesianAxes(el, theme);
    case 'number_line':
      return expandNumberLine(el, theme);
    case 'vector_arrow':
      return expandVectorArrow(el);
    case 'function_curve':
      return expandFunctionCurve(el, theme);
    case 'angle_arc':
      return expandAngleArc(el);
    case 'integral_region':
      return expandIntegralRegion(el, theme);
    case 'circle_with_radius':
      return expandCircleWithRadius(el);
    case 'triangle_with_angles':
      return expandTriangleWithAngles(el);
    case 'parametric_curve':
      return expandParametricCurve(el, theme);
    case 'polar_plot':
      return expandPolarPlot(el, theme);
    case 'riemann_sum':
      return expandRiemannSum(el);
    case 'tangent_line':
      return expandTangentLine(el);
    case 'matrix_bracket':
      return expandMatrixBracket(el);
    case 'linear_transform':
      return expandLinearTransform(el, theme);
    case 'histogram':
      return expandHistogram(el, theme);
    case 'normal_distribution':
      return expandNormalDistribution(el, theme);
    case 'slope_field':
      return expandSlopeField(el);
    case 'vector_field_2d':
      return expandVectorField2d(el);
    case 'wireframe_3d':
      return expandWireframe3d(el);
    case 'sequence_plot':
      return expandSequencePlot(el);
    case 'bezier_curve':
      return expandBezierCurve(el);
    case 'complex_plane':
      return expandComplexPlane(el, theme);
    case 'number_theory_grid':
      return expandNumberTheoryGrid(el);
    case 'annotation_arrow':
      return expandAnnotationArrow(el);
    case 'formula_box':
      return expandFormulaBox(el);
    case 'venn_diagram':
      return expandVennDiagram(el);
    case 'truth_table':
      return expandTruthTable(el);
    case 'conic_section':
      return expandConicSection(el);
    case 'coordinate_grid':
      return expandCoordinateGrid(el);
    case 'symbol_grid':
      return expandSymbolGrid(el);
    case 'equation_system':
      return expandEquationSystem(el);
    case 'comparison_chart':
      return expandComparisonChart(el);
    case 'box_plot':
      return expandBoxPlot(el);
    case 'polygon':
      return expandPolygon(el);
    case 'geometric_construction':
      return expandGeometricConstruction(el);
    case 'interval_diagram':
      return expandIntervalDiagram(el, theme);
  }
}

export interface LoweringDiagnostics {
  inputCount: number;
  outputCount: number;
  capped: boolean;
  timingMs: number;
}

export interface LowerOptions {
  maxElements?: number;
  colorTheme?: ColorTheme;
  /** When provided, populated with lowering diagnostics after expansion. */
  diagnosticsOut?: { current: LoweringDiagnostics | null };
}

export function lowerPlannedLayoutToDrawBatch(
  layout: PlannedSemanticLayout,
  options?: LowerOptions,
  trace?: PlannerTraceContext,
): DrawBatch {
  const run = (): DrawBatch => {
    const maxElements = options?.maxElements ?? DEFAULT_MAX_LOWERED_ELEMENTS;

    // Expand composite math primitives before dedup/validation
    const expandStart = performance.now();
    const expanded = expandMathPrimitives(layout.elements, options?.colorTheme);
    const expandMs = performance.now() - expandStart;

    // Deduplicate elements by id (keep last occurrence)
    const seen = new Map<string, DrawElement>();
    for (const el of expanded) {
      seen.set(el.id, el);
    }
    let deduped = [...seen.values()];

    // Validate elements: remove any where boundsOf returns null or throws
    const beforeCount = deduped.length;
    deduped = deduped.filter((el) => {
      try {
        return boundsOf(el) !== null;
      } catch {
        return false;
      }
    });
    const droppedCount = beforeCount - deduped.length;
    if (droppedCount > 0) {
      layout.warnings.push('elements_dropped_invalid');
    }

    if (deduped.length === 0) {
      layout.warnings.push('empty_layout');
    }

    const wasCapped = deduped.length > maxElements;
    if (wasCapped) {
      deduped = deduped.slice(0, maxElements);
      layout.warnings.push('element_count_capped');
    }

    if (options?.diagnosticsOut) {
      options.diagnosticsOut.current = {
        inputCount: layout.elements.length,
        outputCount: expanded.length,
        capped: wasCapped,
        timingMs: expandMs,
      };
    }

    // Blueprint-neat: snap all coordinates to a 10px grid for crisp alignment
    if (layout.stylePreset === 'blueprint_neat') {
      const G = 10;
      for (const el of deduped) {
        switch (el.type) {
          case 'rect':
            el.x = snapToGrid(el.x, G);
            el.y = snapToGrid(el.y, G);
            el.w = snapToGrid(el.w, G);
            el.h = snapToGrid(el.h, G);
            break;
          case 'ellipse':
            el.cx = snapToGrid(el.cx, G);
            el.cy = snapToGrid(el.cy, G);
            el.rx = snapToGrid(el.rx, G);
            el.ry = snapToGrid(el.ry, G);
            break;
          case 'line':
          case 'arrow':
            el.from = { x: snapToGrid(el.from.x, G), y: snapToGrid(el.from.y, G) };
            el.to = { x: snapToGrid(el.to.x, G), y: snapToGrid(el.to.y, G) };
            break;
          case 'text':
          case 'latex':
            el.x = snapToGrid(el.x, G);
            el.y = snapToGrid(el.y, G);
            break;
          default:
            break;
        }
      }
    }

    // Sort for optimal draw order: shapes → lines/arrows → text/latex
    const sorted = deduped.sort((a, b) => drawOrderPriority(a) - drawOrderPriority(b));

    return {
      batch_id: layout.batchId,
      style_preset: layout.stylePreset,
      elements: sorted,
      ...(options?.colorTheme ? { colorTheme: options.colorTheme } : {}),
    };
  };

  return trace ? trace.span('lower', 'lowerPlannedLayoutToDrawBatch', run) : run();
}
