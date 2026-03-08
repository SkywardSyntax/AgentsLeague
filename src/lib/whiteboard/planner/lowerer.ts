import type {
  DrawBatch,
  DrawElement,
  CartesianAxesElement,
  NumberLineElement,
  VectorArrowElement,
  FunctionCurveElement,
  AngleArcElement,
  IntegralRegionElement,
  CircleWithRadiusElement,
  TriangleWithAnglesElement,
  Point,
} from '@/types/agent';
import { assertNeverDrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from './types';
import type { PlannerTraceContext } from './trace';
import { boundsOf } from './bounds';
import { tickMarksForRange, computeArrowHead } from '../math-sampling';
import { parseMathExpression } from '../graph-script';

export const DEFAULT_MAX_LOWERED_ELEMENTS = 500;

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
    case 'circle_with_radius':
    case 'triangle_with_angles':
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
    result.push({
      id: `${el.id}-label`,
      type: 'text',
      x: el.x + labelR * Math.cos(midRad),
      y: el.y - labelR * Math.sin(midRad),
      text: el.label,
      size: 14,
      color: el.color,
    });
  }

  return result;
}

function expandIntegralRegion(el: IntegralRegionElement): DrawElement[] {
  const result: DrawElement[] = [];
  const strokeColor = el.strokeColor ?? el.color ?? '#1f2a44';
  const fillColor = el.fillColor ?? 'rgba(100,149,237,0.18)';

  // Map logical points → canvas coordinates
  const { toCanvasX, toCanvasY } = makeCoordMapper(
    { x: el.x, y: el.y, width: el.width, height: el.height },
    { xMin: el.xRange[0], xMax: el.xRange[1], yMin: el.yRange[0], yMax: el.yRange[1] },
  );

  const topCanvas = el.topPoints.map((p) => ({ x: toCanvasX(p.x), y: toCanvasY(p.y) }));
  const bottomCanvas = el.bottomPoints
    ? el.bottomPoints.map((p) => ({ x: toCanvasX(p.x), y: toCanvasY(p.y) }))
    : el.topPoints.map((p) => ({ x: toCanvasX(p.x), y: toCanvasY(0) }));

  // Filled polygon: top curve → reversed bottom curve → close
  // Emit as a closed polyline of line segments with fill color
  const polygon = [...topCanvas, ...bottomCanvas.slice().reverse()];
  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i]!;
    const to = polygon[(i + 1) % polygon.length]!;
    result.push({
      id: `${el.id}-fill-${i}`,
      type: 'line',
      from,
      to,
      color: fillColor,
      stroke_width: (el.stroke_width ?? 1) * 0.5,
    });
  }

  // Top boundary stroke
  for (let i = 0; i < topCanvas.length - 1; i++) {
    result.push({
      id: `${el.id}-top-${i}`,
      type: 'line',
      from: topCanvas[i]!,
      to: topCanvas[i + 1]!,
      color: strokeColor,
      stroke_width: el.stroke_width,
    });
  }

  // Bottom boundary stroke
  for (let i = 0; i < bottomCanvas.length - 1; i++) {
    result.push({
      id: `${el.id}-bot-${i}`,
      type: 'line',
      from: bottomCanvas[i]!,
      to: bottomCanvas[i + 1]!,
      color: strokeColor,
      stroke_width: el.stroke_width,
    });
  }

  // Vertical closing edges at integration bounds
  if (topCanvas.length > 0 && bottomCanvas.length > 0) {
    result.push({
      id: `${el.id}-left-edge`,
      type: 'line',
      from: topCanvas[0]!,
      to: bottomCanvas[0]!,
      color: strokeColor,
      stroke_width: el.stroke_width,
    });
    result.push({
      id: `${el.id}-right-edge`,
      type: 'line',
      from: topCanvas[topCanvas.length - 1]!,
      to: bottomCanvas[bottomCanvas.length - 1]!,
      color: strokeColor,
      stroke_width: el.stroke_width,
    });
  }

  // Label
  if (el.label) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
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

  return result;
}

function expandFunctionCurve(el: FunctionCurveElement): DrawElement[] {
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

// ---------------------------------------------------------------------------
// CartesianAxes / NumberLine / VectorArrow expansion
// ---------------------------------------------------------------------------

function expandCartesianAxes(el: CartesianAxesElement): DrawElement[] {
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

  // --- Axis labels (near arrowheads) ---
  if (el.xLabel) {
    result.push({
      id: `${el.id}-x-label`,
      type: 'text' as const,
      x: x + width + ARROW_EXT + 4,
      y: originY + 4,
      text: el.xLabel,
      size: 13,
      color,
    });
  }
  if (el.yLabel) {
    result.push({
      id: `${el.id}-y-label`,
      type: 'text' as const,
      x: originX + 8,
      y: y - ARROW_EXT - 2,
      text: el.yLabel,
      size: 13,
      color,
    });
  }

  return result;
}

function expandNumberLine(el: NumberLineElement): DrawElement[] {
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
      result.push({
        id: `${el.id}-hl-${i}`,
        type: 'ellipse' as const,
        cx: hx,
        cy: y,
        rx: 3.5,
        ry: 3.5,
        color,
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
          color,
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

  // Arrowhead via computeArrowHead
  const headLength = Math.min(14, len * 0.3);
  const head = computeArrowHead(from, to, headLength);
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

/**
 * Expand composite math primitives into basic DrawElements.
 * angle_arc, integral_region, function_curve, cartesian_axes,
 * number_line, vector_arrow, circle_with_radius, and triangle_with_angles
 * are decomposed into line + arrow + text + ellipse
 * elements so the rest of the pipeline can handle them uniformly.
 */
function expandMathPrimitives(elements: DrawElement[]): DrawElement[] {
  const result: DrawElement[] = [];
  for (const el of elements) {
    if (el.type === 'function_curve') {
      result.push(...expandFunctionCurve(el));
    } else if (el.type === 'angle_arc') {
      result.push(...expandAngleArc(el));
    } else if (el.type === 'integral_region') {
      result.push(...expandIntegralRegion(el));
    } else if (el.type === 'cartesian_axes') {
      result.push(...expandCartesianAxes(el));
    } else if (el.type === 'number_line') {
      result.push(...expandNumberLine(el));
    } else if (el.type === 'vector_arrow') {
      result.push(...expandVectorArrow(el));
    } else if (el.type === 'circle_with_radius') {
      result.push(...expandCircleWithRadius(el));
    } else if (el.type === 'triangle_with_angles') {
      result.push(...expandTriangleWithAngles(el));
    } else {
      result.push(el);
    }
  }
  return result;
}

/**
 * Lower a single math primitive element to basic DrawElements.
 * Exported for use in semantic-to-strokes.ts as a fallback when
 * elements arrive without having been through the planner lowering pass.
 */
export function lowerMathPrimitive(
  el: CartesianAxesElement | NumberLineElement | VectorArrowElement | FunctionCurveElement | AngleArcElement | IntegralRegionElement | CircleWithRadiusElement | TriangleWithAnglesElement,
): DrawElement[] {
  switch (el.type) {
    case 'cartesian_axes':
      return expandCartesianAxes(el);
    case 'number_line':
      return expandNumberLine(el);
    case 'vector_arrow':
      return expandVectorArrow(el);
    case 'function_curve':
      return expandFunctionCurve(el);
    case 'angle_arc':
      return expandAngleArc(el);
    case 'integral_region':
      return expandIntegralRegion(el);
    case 'circle_with_radius':
      return expandCircleWithRadius(el);
    case 'triangle_with_angles':
      return expandTriangleWithAngles(el);
  }
}

export interface LowerOptions {
  maxElements?: number;
}

export function lowerPlannedLayoutToDrawBatch(
  layout: PlannedSemanticLayout,
  options?: LowerOptions,
  trace?: PlannerTraceContext,
): DrawBatch {
  const run = (): DrawBatch => {
    const maxElements = options?.maxElements ?? DEFAULT_MAX_LOWERED_ELEMENTS;

    // Expand composite math primitives before dedup/validation
    const expanded = expandMathPrimitives(layout.elements);

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

    if (deduped.length > maxElements) {
      deduped = deduped.slice(0, maxElements);
      layout.warnings.push('element_count_capped');
    }

    // Sort for optimal draw order: shapes → lines/arrows → text/latex
    const sorted = deduped.sort((a, b) => drawOrderPriority(a) - drawOrderPriority(b));

    return {
      batch_id: layout.batchId,
      style_preset: layout.stylePreset,
      elements: sorted,
    };
  };

  return trace ? trace.span('lower', 'lowerPlannedLayoutToDrawBatch', run) : run();
}
