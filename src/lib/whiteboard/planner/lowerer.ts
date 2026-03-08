import type {
  DrawBatch,
  DrawElement,
  CartesianAxesElement,
  NumberLineElement,
  VectorArrowElement,
  FunctionCurveElement,
  AngleArcElement,
  IntegralRegionElement,
  Point,
} from '@/types/agent';
import { assertNeverDrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from './types';
import type { PlannerTraceContext } from './trace';
import { boundsOf } from './bounds';
import { tickMarksForRange, computeArrowHead } from '../math-sampling';

export const DEFAULT_MAX_LOWERED_ELEMENTS = 60;

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
    const labelR = el.radius * 1.3;
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
  const [xMin, xMax] = el.xRange;
  const [yMin, yMax] = el.yRange;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const toCanvasX = (lx: number) => el.x + ((lx - xMin) / xSpan) * el.width;
  const toCanvasY = (ly: number) => el.y + el.height - ((ly - yMin) / ySpan) * el.height;

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
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const toCanvasX = (lx: number) => el.x + ((lx - xMin) / xSpan) * el.width;
  const toCanvasY = (ly: number) => el.y + el.height - ((ly - yMin) / ySpan) * el.height;

  // Build segments from pre-sampled points (or evaluate expression)
  let rawPoints: Array<{ x: number; y: number }> = [];
  if (el.points && el.points.length > 0) {
    rawPoints = el.points;
  } else if (el.expression) {
    const steps = 80;
    const dx = (xMax - xMin) / (steps - 1);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function('x', `"use strict"; return (${el.expression});`) as (x: number) => number;
    for (let i = 0; i < steps; i++) {
      const x = xMin + i * dx;
      try {
        const y = fn(x);
        rawPoints.push({ x, y });
      } catch {
        rawPoints.push({ x, y: NaN });
      }
    }
  }

  if (rawPoints.length < 2) return result;

  // Split on discontinuities (non-finite values or large jumps)
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
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
        color: el.color,
        stroke_width: el.stroke_width,
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
      color: el.color,
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
  const sw = el.stroke_width ?? 1.5;

  const xSpan = xRange[1] - xRange[0];
  const ySpan = yRange[1] - yRange[0];
  if (xSpan <= 0 || ySpan <= 0) return result;

  const xScale = width / xSpan;
  const yScale = height / ySpan;

  // Axis endpoints
  const xAxisFrom: Point = { x: x + xRange[0] * xScale, y };
  const xAxisTo: Point = { x: x + xRange[1] * xScale, y };
  const yAxisFrom: Point = { x, y: y - yRange[0] * yScale };
  const yAxisTo: Point = { x, y: y - yRange[1] * yScale };

  const TICK_HALF = 4;

  // --- Gridlines (render first so they appear behind axes) ---
  if (el.gridlines) {
    const xTicks = tickMarksForRange(xRange[0], xRange[1], 10);
    for (let i = 0; i < xTicks.length; i++) {
      const t = xTicks[i]!;
      const sx = x + t.value * xScale;
      result.push({
        id: `${el.id}-xgrid-${i}`,
        type: 'line' as const,
        from: { x: sx, y: yAxisTo.y },
        to: { x: sx, y: yAxisFrom.y },
        color: '#cccccc',
        stroke_width: 0.5,
      });
    }
    const yTicks = tickMarksForRange(yRange[0], yRange[1], 10);
    for (let i = 0; i < yTicks.length; i++) {
      const t = yTicks[i]!;
      const sy = y - t.value * yScale;
      result.push({
        id: `${el.id}-ygrid-${i}`,
        type: 'line' as const,
        from: { x: xAxisFrom.x, y: sy },
        to: { x: xAxisTo.x, y: sy },
        color: '#cccccc',
        stroke_width: 0.5,
      });
    }
  }

  // --- Axis arrows ---
  result.push({
    id: `${el.id}-x-axis`,
    type: 'arrow' as const,
    from: xAxisFrom,
    to: xAxisTo,
    color,
    stroke_width: sw,
  });
  result.push({
    id: `${el.id}-y-axis`,
    type: 'arrow' as const,
    from: yAxisFrom,
    to: yAxisTo,
    color,
    stroke_width: sw,
  });

  // --- X tick marks + labels ---
  const xTicks = tickMarksForRange(xRange[0], xRange[1], 10);
  for (let i = 0; i < xTicks.length; i++) {
    const t = xTicks[i]!;
    if (t.value === 0) continue;
    const sx = x + t.value * xScale;
    result.push({
      id: `${el.id}-xtick-${i}`,
      type: 'line' as const,
      from: { x: sx, y: y - TICK_HALF },
      to: { x: sx, y: y + TICK_HALF },
      color,
      stroke_width: 1,
    });
    result.push({
      id: `${el.id}-xtlbl-${i}`,
      type: 'text' as const,
      x: sx,
      y: y + TICK_HALF + 14,
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
    const sy = y - t.value * yScale;
    result.push({
      id: `${el.id}-ytick-${i}`,
      type: 'line' as const,
      from: { x: x - TICK_HALF, y: sy },
      to: { x: x + TICK_HALF, y: sy },
      color,
      stroke_width: 1,
    });
    result.push({
      id: `${el.id}-ytlbl-${i}`,
      type: 'text' as const,
      x: x - TICK_HALF - 8,
      y: sy,
      text: t.label,
      size: 10,
      color,
    });
  }

  // --- Axis labels (near arrowheads) ---
  if (el.xLabel) {
    result.push({
      id: `${el.id}-x-label`,
      type: 'text' as const,
      x: xAxisTo.x + 8,
      y: xAxisTo.y + 4,
      text: el.xLabel,
      size: 13,
      color,
    });
  }
  if (el.yLabel) {
    result.push({
      id: `${el.id}-y-label`,
      type: 'text' as const,
      x: yAxisTo.x + 8,
      y: yAxisTo.y - 4,
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
  const sw = el.stroke_width ?? 1.5;

  const span = max - min;
  if (span <= 0 || length <= 0) return result;
  const scale = length / span;

  // Main axis arrow
  result.push({
    id: `${el.id}-axis`,
    type: 'arrow' as const,
    from: { x, y },
    to: { x: x + length, y },
    color,
    stroke_width: sw,
  });

  // Tick marks + labels
  const TICK_HALF = 4;
  const ticks = tickMarksForRange(min, max, 10);
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i]!;
    const sx = x + (t.value - min) * scale;
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
      x: sx,
      y: y + TICK_HALF + 14,
      text: t.label,
      size: 10,
      color,
    });
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

  // Label at midpoint
  if (el.label) {
    result.push({
      id: `${el.id}-label`,
      type: 'text' as const,
      x: x + dx / 2 + 8,
      y: y + dy / 2 - 8,
      text: el.label,
      size: 13,
      color,
    });
  }

  return result;
}

/**
 * Expand composite math primitives into basic DrawElements.
 * angle_arc, integral_region, function_curve, cartesian_axes,
 * number_line, and vector_arrow are decomposed into line + arrow + text
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
  el: CartesianAxesElement | NumberLineElement | VectorArrowElement,
): DrawElement[] {
  switch (el.type) {
    case 'cartesian_axes':
      return expandCartesianAxes(el);
    case 'number_line':
      return expandNumberLine(el);
    case 'vector_arrow':
      return expandVectorArrow(el);
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
