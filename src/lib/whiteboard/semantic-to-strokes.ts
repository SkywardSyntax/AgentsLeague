import type {
  DrawBatch,
  DrawElement,
  DrawingSpeed,
  Point,
  StylePreset,
  StrokeTrajectory,
} from '@/types/agent';
import { assertNeverDrawElement } from '@/types/agent';
import { renderTexToSvg, extractSvgStrokes } from '@/lib/latex/mathjax-client';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';
import { resamplePolyline, strokesBoundingBox } from './geometry';
import {
  strokeWidthForPreset,
  rectPoints,
  ellipsePoints,
  linePoints,
  arrowHeadPoints,
} from './shape-points';
import { withJitter, withJitterAmount } from './stroke-jitter';
import { lowerMathPrimitive } from './planner/lowerer';
import type { ColorTheme } from '@/lib/whiteboard/color-theme';

// Re-export for cross-lane backward compatibility
export { rectPoints, ellipsePoints, linePoints, arrowHeadPoints } from './shape-points';
export { withJitter } from './stroke-jitter';

const DEFAULT_COLOR = '#1f2a44';
const DEFAULT_BASE_WIDTH = 1.45;
const MAX_TEXT_LINES = 50;


async function compileTextLikeElement(
  tex: string,
  elementId: string,
  x: number,
  y: number,
  fontSize: number,
  color: string,
  baseWidth: number,
  displayMode: boolean,
): Promise<StrokeTrajectory[]> {
  const svg = await renderTexToSvg(tex, displayMode);
  return extractSvgStrokes(svg, {
    offsetX: x,
    offsetY: y,
    scale: fontSize / 16,
    strokeIdPrefix: elementId,
    color,
    baseWidth,
  });
}

export function escapePlainTextForTex(input: string): string {
  return input.replace(/([\\{}$&#_^%~])/g, '\\$1');
}

export function looksMathLikeText(input: string): boolean {
  const value = input.trim();
  if (!value) return false;
  if (/\\[a-zA-Z]+/.test(value)) return true;
  if (/[=±]/.test(value) && /[+\-*/^]/.test(value)) return true;
  if (/(?<!\\)[\^_](\{[^}]+\}|[A-Za-z0-9])/.test(value)) return true;
  return false;
}

export function strokesBounds(strokes: StrokeTrajectory[]) {
  return strokesBoundingBox(strokes);
}

function shiftStrokes(strokes: StrokeTrajectory[], dx: number, dy: number): void {
  for (const stroke of strokes) {
    stroke.points = stroke.points.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
    if (stroke.bounds) {
      stroke.bounds = {
        minX: stroke.bounds.minX + dx,
        minY: stroke.bounds.minY + dy,
        maxX: stroke.bounds.maxX + dx,
        maxY: stroke.bounds.maxY + dy,
      };
    }
  }
}

export function resolveSourceElementId(strokeElementId: string, elementIdsSorted: string[] | Set<string>): string | null {
  for (const id of elementIdsSorted) {
    if (strokeElementId === id || strokeElementId.startsWith(`${id}-`)) return id;
  }
  return null;
}

function horizontalOverlapPx(
  a: { minX: number; maxX: number },
  b: { minX: number; maxX: number },
): number {
  return Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
}

function textLineClusterId(strokeElementId: string): string {
  const match = strokeElementId.match(/^(.*)-seg-\d+-(?:line-\d+|latex)-ln-(\d+)$/);
  if (!match) return strokeElementId;
  return `${match[1]!}-ln-${match[2]!}`;
}

function textLineOrder(strokeElementId: string): number | null {
  const match = strokeElementId.match(/-ln-(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function normalizeTextVerticalSpacing(batch: DrawBatch, strokes: StrokeTrajectory[]): void {
  const elementOrder = new Map(batch.elements.map((el, idx) => [el.id, idx] as const));
  const elementType = new Map(batch.elements.map((el) => [el.id, el.type] as const));
  const sourceIds = new Set(elementOrder.keys());

  const groups = new Map<
    string,
    {
      clusterId: string;
      type: 'text' | 'latex';
      sourceOrder: number;
      strokeOrder: number;
      lineOrder: number;
      strokes: StrokeTrajectory[];
      bounds: ReturnType<typeof strokesBounds> | null;
    }
  >();

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i]!;
    const sourceId = resolveSourceElementId(stroke.elementId, sourceIds);
    if (!sourceId) continue;

    const type = elementType.get(sourceId);
    if (type !== 'text' && type !== 'latex') continue;

    const clusterId = type === 'text' ? textLineClusterId(stroke.elementId) : stroke.elementId;
    const lineOrder = type === 'text' ? textLineOrder(stroke.elementId) ?? Number.MAX_SAFE_INTEGER : -1;
    const entry = groups.get(clusterId);
    if (entry) {
      entry.strokes.push(stroke);
      continue;
    }

    groups.set(clusterId, {
      clusterId,
      type,
      sourceOrder: elementOrder.get(sourceId) ?? Number.MAX_SAFE_INTEGER,
      strokeOrder: i,
      lineOrder,
      strokes: [stroke],
      bounds: null,
    });
  }

  const ordered = [...groups.values()]
    .map((group) => ({ ...group, bounds: strokesBounds(group.strokes) }))
    .filter((group): group is typeof group & { bounds: NonNullable<typeof group.bounds> } => group.bounds !== null)
    .sort((a, b) => {
      if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
      if (a.lineOrder !== b.lineOrder) return a.lineOrder - b.lineOrder;
      if (a.strokeOrder !== b.strokeOrder) return a.strokeOrder - b.strokeOrder;
      return a.bounds.minY - b.bounds.minY;
    });

  const placed: Array<(typeof ordered)[number]> = [];
  for (const group of ordered) {
    let requiredDy = 0;

    for (let j = placed.length - 1; j >= 0; j--) {
      const prev = placed[j]!;
      const overlapX = horizontalOverlapPx(group.bounds, prev.bounds);
      if (overlapX < 10) continue;

      const dynamicGap = Math.min(
        34,
        Math.max(group.bounds.height, prev.bounds.height) * 0.2,
      );
      const minGap = Math.max(group.type === 'latex' || prev.type === 'latex' ? 14 : 10, dynamicGap);
      const needed = prev.bounds.maxY + minGap - group.bounds.minY;
      if (needed > requiredDy) requiredDy = needed;
      break;
    }

    if (requiredDy > 0) {
      shiftStrokes(group.strokes, 0, requiredDy);
      group.bounds = {
        ...group.bounds,
        minY: group.bounds.minY + requiredDy,
        maxY: group.bounds.maxY + requiredDy,
      };
    }

    placed.push(group);
  }
}

async function compileOneElement(
  element: DrawElement,
  preset: StylePreset | undefined,
): Promise<{ strokes: StrokeTrajectory[]; warnings: string[]; clear: boolean }> {
  const strokes: StrokeTrajectory[] = [];
  const warnings: string[] = [];
  const color = element.color ?? DEFAULT_COLOR;
  const baseWidth = strokeWidthForPreset(preset, element.stroke_width ?? DEFAULT_BASE_WIDTH);
  const isMathematical = preset === 'mathematical' || preset === 'blueprint_neat';
  const lineStyle = ('lineStyle' in element ? element.lineStyle : undefined) ?? undefined;

  if (element.type === 'clear') {
    return { strokes, warnings, clear: true };
  }

  if (element.type === 'rect') {
    const points = withJitter(resamplePolyline(rectPoints(element), 4), element.id, preset);
    strokes.push({ id: `${element.id}-rect`, elementId: element.id, points, color, baseWidth, lineStyle, mathematical: isMathematical });
    return { strokes, warnings, clear: false };
  }

  if (element.type === 'ellipse') {
    const points = withJitter(resamplePolyline(ellipsePoints(element), 4), element.id, preset);
    strokes.push({ id: `${element.id}-ellipse`, elementId: element.id, points, color, baseWidth, lineStyle, mathematical: isMathematical });
    return { strokes, warnings, clear: false };
  }

  if (element.type === 'line') {
    const points = withJitter(resamplePolyline(linePoints(element), 3), element.id, preset);
    strokes.push({ id: `${element.id}-line`, elementId: element.id, points, color, baseWidth, lineStyle, mathematical: isMathematical });
    return { strokes, warnings, clear: false };
  }

  if (element.type === 'arrow') {
    const main = withJitter(resamplePolyline(linePoints(element), 3), `${element.id}-main`, preset);
    strokes.push({ id: `${element.id}-arrow-main`, elementId: element.id, points: main, color, baseWidth, lineStyle, mathematical: isMathematical });
    const heads = arrowHeadPoints(element);
    heads.forEach((head, idx) => {
      strokes.push({
        id: `${element.id}-arrow-head-${idx}`,
        elementId: element.id,
        points: withJitter(resamplePolyline(head, 3), `${element.id}-head-${idx}`, preset),
        color,
        baseWidth,
        mathematical: isMathematical,
      });
    });
    return { strokes, warnings, clear: false };
  }

  if (element.type === 'text') {
    let recovered = false;

    try {
      const segments = parseStreamingLatex(element.text);
      let cursorX = element.x;
      let cursorY = element.y;
      const fontSize = element.size ?? 18;
      let lineTop = cursorY;
      let lineBottom = cursorY + fontSize * 0.92;
      let lineIndex = 0;

      const advanceLine = () => {
        const minAdvance = fontSize * 1.42;
        const contentAdvance = Math.max(fontSize * 1.15, lineBottom - lineTop + fontSize * 0.34);
        const deltaY = Math.max(minAdvance, contentAdvance);
        cursorX = element.x;
        cursorY += deltaY;
        lineTop = cursorY;
        lineBottom = cursorY + fontSize * 0.92;
        lineIndex += 1;
      };

      const applyStrokesAndAdvance = (
        rendered: StrokeTrajectory[],
        jitterAmount: number,
        fallbackAdvance: number,
        minAdvanceGap: number,
      ) => {
        rendered.forEach((stroke) => {
          stroke.points = withJitterAmount(stroke.points, stroke.id, jitterAmount);
          strokes.push(stroke);
        });

        const bounds = strokesBounds(rendered);
        if (bounds) {
          const advanceX = Math.max(fontSize * 0.28, bounds.maxX - cursorX + minAdvanceGap);
          cursorX += advanceX;
          lineTop = Math.min(lineTop, bounds.minY);
          lineBottom = Math.max(lineBottom, bounds.maxY);
        } else {
          cursorX += fallbackAdvance;
          lineBottom = Math.max(lineBottom, cursorY + fontSize);
        }
      };

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!;

        if (segment.kind === 'text') {
          const allLines = segment.value.replace(/\r\n/g, '\n').split('\n');
          const lines = allLines.slice(0, MAX_TEXT_LINES);
          if (allLines.length > MAX_TEXT_LINES) {
            warnings.push(`Text element ${element.id} truncated from ${allLines.length} to ${MAX_TEXT_LINES} lines`);
          }
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx]!;
            if (line.length > 0) {
              const leadingSpaceCount = line.match(/^\s+/)?.[0]?.length ?? 0;
              const trailingSpaceCount = line.match(/\s+$/)?.[0]?.length ?? 0;
              const coreStart = leadingSpaceCount;
              const coreEnd = Math.max(coreStart, line.length - trailingSpaceCount);
              const core = line.slice(coreStart, coreEnd);
              const spaceAdvance = fontSize * 0.31;

              if (leadingSpaceCount > 0) {
                cursorX += leadingSpaceCount * spaceAdvance;
              }

              if (core.length > 0) {
                const safeLine = escapePlainTextForTex(core);
                const lineStrokes = await compileTextLikeElement(
                  `\\text{${safeLine}}`,
                  `${element.id}-seg-${i}-line-${lineIdx}-ln-${lineIndex}`,
                  cursorX,
                  cursorY,
                  fontSize,
                  color,
                  baseWidth,
                  false,
                );
                applyStrokesAndAdvance(
                  lineStrokes,
                  0.035,
                  Math.max(fontSize * 0.45, core.length * (fontSize * 0.5)),
                  fontSize * 0.1,
                );
              }

              if (trailingSpaceCount > 0) {
                cursorX += trailingSpaceCount * spaceAdvance;
                lineBottom = Math.max(lineBottom, cursorY + fontSize * 0.92);
              }
            }

            if (lineIdx < lines.length - 1) {
              advanceLine();
            }
          }
          continue;
        }

        if (segment.display && cursorX !== element.x) {
          advanceLine();
        }

        const latexStrokes = await compileTextLikeElement(
          segment.value,
          `${element.id}-seg-${i}-latex-ln-${lineIndex}`,
          cursorX,
          cursorY,
          fontSize,
          color,
          baseWidth,
          segment.display,
        );
        applyStrokesAndAdvance(
          latexStrokes,
          0.03,
          Math.max(fontSize * 0.7, Math.max(1, segment.value.length) * (fontSize * 0.45)),
          fontSize * 0.2,
        );

        if (segment.display) {
          advanceLine();
        }
      }

      recovered = strokes.length > 0;
    } catch {
      recovered = false;
    }

    if (!recovered && looksMathLikeText(element.text)) {
      try {
        const asLatex = await compileTextLikeElement(
          element.text,
          `${element.id}-as-latex`,
          element.x,
          element.y,
          element.size ?? 18,
          color,
          baseWidth,
          false,
        );
        asLatex.forEach((stroke) => {
          stroke.points = withJitterAmount(stroke.points, stroke.id, 0.03);
          strokes.push(stroke);
        });
        recovered = asLatex.length > 0;
      } catch {
        recovered = false;
      }
    }

    if (!recovered) {
      const fontSize = element.size ?? 18;
      const fallbackPoint: Point = { x: element.x, y: element.y };
      strokes.push({
        id: `${element.id}-text-fallback`,
        elementId: element.id,
        points: [fallbackPoint, { x: element.x + 1, y: element.y }],
        color,
        baseWidth,
        textFallback: { text: element.text, x: element.x, y: element.y, fontSize },
        mathematical: isMathematical,
      });
      warnings.push(`Text render fallback for element ${element.id}`);
    }
    return { strokes, warnings, clear: false };
  }

  if (element.type === 'latex') {
    try {
      const latexStrokes = await compileTextLikeElement(
        element.tex,
        element.id,
        element.x,
        element.y,
        element.fontSize ?? 20,
        color,
        baseWidth,
        element.displayMode ?? true,
      );
      latexStrokes.forEach((stroke) => {
        stroke.points = withJitterAmount(stroke.points, stroke.id, 0.03);
        strokes.push(stroke);
      });
    } catch {
      warnings.push(`LaTeX parse error for ${element.id}; fallback used`);
      const safeRaw = escapePlainTextForTex(element.tex);
      try {
        const fallback = await compileTextLikeElement(
          `\\texttt{${safeRaw}}`,
          element.id,
          element.x,
          element.y,
          element.fontSize ?? 18,
          color,
          baseWidth,
          false,
        );
        fallback.forEach((stroke) => strokes.push(stroke));
      } catch {
        warnings.push(`Fallback text failed for ${element.id}`);
      }
    }
    return { strokes, warnings, clear: false };
  }

  // Math primitives with lowering support: expand to basic elements and compile
  if (element.type === 'cartesian_axes' || element.type === 'number_line' || element.type === 'vector_arrow'
    || element.type === 'function_curve' || element.type === 'angle_arc' || element.type === 'integral_region'
    || element.type === 'circle_with_radius' || element.type === 'triangle_with_angles'
    || element.type === 'parametric_curve' || element.type === 'polar_plot'
    || element.type === 'matrix_bracket' || element.type === 'linear_transform'
    || element.type === 'riemann_sum' || element.type === 'tangent_line'
    || element.type === 'histogram' || element.type === 'normal_distribution'
    || element.type === 'slope_field' || element.type === 'vector_field_2d'
    || element.type === 'wireframe_3d'
    || element.type === 'sequence_plot' || element.type === 'bezier_curve'
    || element.type === 'complex_plane' || element.type === 'number_theory_grid'
    || element.type === 'polygon' || element.type === 'geometric_construction'
    || element.type === 'annotation_arrow' || element.type === 'formula_box'
    || element.type === 'venn_diagram' || element.type === 'truth_table'
    || element.type === 'conic_section' || element.type === 'coordinate_grid'
    || element.type === 'probability_tree' || element.type === 'scatter_plot'
    || element.type === 'symbol_grid' || element.type === 'equation_system'
    || element.type === 'comparison_chart' || element.type === 'box_plot'
    || element.type === 'interval_diagram') {
    const lowered = lowerMathPrimitive(element);
    for (const lowEl of lowered) {
      const sub = await compileOneElement(lowEl, preset);
      strokes.push(...sub.strokes);
      warnings.push(...sub.warnings);
    }
    return { strokes, warnings, clear: false };
  }

  // Exhaustive fallback: compile-time error when a new DrawElement variant is
  // added but not handled above. At runtime, logs a warning and returns empty.
  const _unhandled: never = element;
  warnings.push(`Unknown DrawElement type "${(_unhandled as unknown as Record<string, unknown>)?.type}" for element ${(element as unknown as Record<string, unknown>).id}; skipped`);
  return { strokes, warnings, clear: false };
}

/**
 * Injection draw-order priority: determines the order elements are drawn
 * so that background elements appear first, then structure, then curves, then labels.
 *   0 = grid lines, fill regions (background)
 *   1 = axes, outlines (structure)
 *   2 = main curves, shapes (content)
 *   3 = labels, text, latex (annotations)
 */
function injectionDrawPriority(el: DrawElement): number {
  const id = el.id.toLowerCase();

  if (id.includes('grid') || id.includes('fill') || id.includes('region')) return 0;
  if (id.includes('axis') || id.includes('axes') || id.includes('tick') || id.includes('outline')) return 1;

  switch (el.type) {
    case 'text':
    case 'latex':
      return 3;
    case 'rect':
    case 'ellipse':
      return id.includes('bg') || id.includes('background') ? 0 : 2;
    case 'line':
      return id.includes('arrow') ? 1 : 2;
    case 'arrow':
      return 1;
    default:
      return 2;
  }
}

/** Map injection draw priority → drawingSpeed hint for strokes. */
function speedForInjectionPriority(priority: number): DrawingSpeed {
  switch (priority) {
    case 0: return 'fast';
    case 1: return 'natural';
    case 3: return 'fast';
    default: return 'slow';  // priority 2 — main curves
  }
}

/**
 * Expand any math primitive elements to basic DrawElements, then sort
 * by injection draw priority so background draws first.
 * Returns elements with drawingSpeed hints attached via a side-map.
 */
function expandAndSortForInjection(
  elements: DrawElement[],
  isInjection: boolean,
  colorTheme?: ColorTheme,
): { sorted: DrawElement[]; speedHints: Map<string, DrawingSpeed>; originTypes: Map<string, string> } {
  const speedHints = new Map<string, DrawingSpeed>();
  /** Maps expanded element IDs → original math primitive type (or own type). */
  const originTypes = new Map<string, string>();

  // Expand math primitives at batch level
  const expanded: DrawElement[] = [];
  for (const el of elements) {
    if (
      el.type === 'function_curve' ||
      el.type === 'angle_arc' ||
      el.type === 'integral_region' ||
      el.type === 'cartesian_axes' ||
      el.type === 'number_line' ||
      el.type === 'vector_arrow' ||
      el.type === 'circle_with_radius' ||
      el.type === 'triangle_with_angles' ||
      el.type === 'parametric_curve' ||
      el.type === 'polar_plot' ||
      el.type === 'riemann_sum' ||
      el.type === 'tangent_line' ||
      el.type === 'matrix_bracket' ||
      el.type === 'linear_transform' ||
      el.type === 'histogram' ||
      el.type === 'normal_distribution' ||
      el.type === 'wireframe_3d' ||
      el.type === 'sequence_plot' ||
      el.type === 'bezier_curve' ||
      el.type === 'complex_plane' ||
      el.type === 'number_theory_grid' ||
      el.type === 'polygon' ||
      el.type === 'geometric_construction' ||
      el.type === 'annotation_arrow' ||
      el.type === 'formula_box' ||
      el.type === 'venn_diagram' ||
      el.type === 'truth_table' ||
      el.type === 'conic_section' ||
      el.type === 'coordinate_grid' ||
      el.type === 'probability_tree' ||
      el.type === 'scatter_plot' ||
      el.type === 'symbol_grid' ||
      el.type === 'equation_system' ||
      el.type === 'comparison_chart' ||
      el.type === 'box_plot' ||
      el.type === 'interval_diagram'
    ) {
      const lowered = lowerMathPrimitive(el, colorTheme);
      for (const child of lowered) {
        originTypes.set(child.id, el.type);
      }
      expanded.push(...lowered);
    } else {
      originTypes.set(el.id, el.type);
      expanded.push(el);
    }
  }

  if (!isInjection) {
    return { sorted: expanded, speedHints, originTypes };
  }

  // Sort by injection priority
  const sorted = [...expanded].sort(
    (a, b) => injectionDrawPriority(a) - injectionDrawPriority(b),
  );

  // Assign speed hints by priority
  for (const el of sorted) {
    const priority = injectionDrawPriority(el);
    speedHints.set(el.id, speedForInjectionPriority(priority));
  }

  return { sorted, speedHints, originTypes };
}

/** Detect curve segment IDs like "mycurve-seg0-3". */
function isCurveSegmentId(id: string): boolean {
  return /-seg\d+-\d+$/.test(id);
}

/** Extract the curve segment group key from an element ID (e.g. "mycurve-seg0"). */
function curveSegmentGroup(id: string): string | null {
  const match = id.match(/^(.*-seg\d+)-\d+$/);
  return match ? match[1]! : null;
}

/**
 * Merge consecutive 2-point line strokes from the same curve segment into a
 * single multi-point stroke so the animation loop can progressively reveal
 * the curve as one continuous "draw-as-you-go" stroke.
 */
export function consolidateCurveStrokes(strokes: StrokeTrajectory[]): StrokeTrajectory[] {
  const result: StrokeTrajectory[] = [];
  let i = 0;

  while (i < strokes.length) {
    const stroke = strokes[i]!;
    const group = stroke.meta?.curveSegment ? curveSegmentGroup(stroke.id) : null;

    if (!group) {
      result.push(stroke);
      i++;
      continue;
    }

    // Collect consecutive strokes in the same curve segment group
    const merged: StrokeTrajectory = {
      ...stroke,
      id: group,
      points: [...stroke.points],
    };

    let j = i + 1;
    while (j < strokes.length) {
      const next = strokes[j]!;
      const nextGroup = next.meta?.curveSegment ? curveSegmentGroup(next.id) : null;
      if (nextGroup !== group) break;
      // Append only the endpoint (avoid duplicating shared vertices)
      if (next.points.length >= 2) {
        merged.points.push(next.points[next.points.length - 1]!);
      }
      j++;
    }

    result.push(merged);
    i = j;
  }

  return result;
}

export async function compileBatchToStrokes(
  batch: DrawBatch,
): Promise<{ strokes: StrokeTrajectory[]; warnings: string[]; clear: boolean }> {
  const preset = batch.style_preset ?? 'clean_pen_sketch';
  const isInjection = batch.source === 'injection';

  // Pre-expand math primitives and sort by draw order for injections
  const { sorted: elements, speedHints, originTypes } = expandAndSortForInjection(
    batch.elements,
    isInjection,
    batch.colorTheme,
  );

  const results = await Promise.all(elements.map((el) => compileOneElement(el, preset)));

  const strokes: StrokeTrajectory[] = [];
  const warnings: string[] = [];
  let clear = false;

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.clear) clear = true;
    const el = elements[i]!;
    // Propagate meta.elementType from the source element
    const originType = originTypes.get(el.id) ?? el.type;
    const isCurveSeg = isCurveSegmentId(el.id);
    // Apply speed hints from injection priority to each stroke
    if (isInjection) {
      const hint = speedHints.get(el.id);
      if (hint) {
        for (const stroke of r.strokes) {
          if (!stroke.drawingSpeed) {
            stroke.drawingSpeed = hint;
          }
        }
      }
    }
    for (const stroke of r.strokes) {
      stroke.meta = {
        elementType: originType,
        curveSegment: isCurveSeg,
      };
    }
    strokes.push(...r.strokes);
    warnings.push(...r.warnings);
  }

  // Consolidate consecutive curve segments into single multi-point strokes
  const consolidated = consolidateCurveStrokes(strokes);

  normalizeTextVerticalSpacing(batch, consolidated);

  // Compute bounding boxes for viewport culling (after normalization shifts)
  for (const stroke of consolidated) {
    if (stroke.points.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of stroke.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      stroke.bounds = { minX, minY, maxX, maxY };
    }
  }

  return { strokes: consolidated, warnings, clear };
}
