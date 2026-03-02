import type {
  DrawBatch,
  DrawElement,
  Point,
  StrokeTrajectory,
  StylePreset,
} from '@/types/agent';
import { hashString, seededRandom } from '@/lib/math/seed';
import { renderTexToSvg, extractSvgStrokes } from '@/lib/latex/mathjax-client';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';
import { resamplePolyline } from './geometry';

const DEFAULT_COLOR = '#1f2a44';
const DEFAULT_BASE_WIDTH = 1.45;

function strokeWidthForPreset(preset: StylePreset | undefined, base: number): number {
  switch (preset) {
    case 'rough_sketch':
      return base * 1.15;
    case 'blueprint_neat':
      return base * 0.88;
    default:
      return base;
  }
}

export function withJitter(points: Point[], seed: string, preset: StylePreset | undefined): Point[] {
  const rnd = seededRandom(hashString(seed));
  const amount = preset === 'rough_sketch' ? 0.85 : preset === 'blueprint_neat' ? 0.12 : 0.24;
  if (amount <= 0) return points;

  return points.map((p, idx) => {
    if (idx === 0 || idx === points.length - 1) return p;
    return {
      x: p.x + (rnd() - 0.5) * amount,
      y: p.y + (rnd() - 0.5) * amount,
    };
  });
}

function withJitterAmount(points: Point[], seed: string, amount: number): Point[] {
  if (amount <= 0) return points;
  const rnd = seededRandom(hashString(seed));
  return points.map((p, idx) => {
    if (idx === 0 || idx === points.length - 1) return p;
    return {
      x: p.x + (rnd() - 0.5) * amount,
      y: p.y + (rnd() - 0.5) * amount,
    };
  });
}

export function rectPoints(el: Extract<DrawElement, { type: 'rect' }>): Point[] {
  return [
    { x: el.x, y: el.y },
    { x: el.x + el.w, y: el.y },
    { x: el.x + el.w, y: el.y + el.h },
    { x: el.x, y: el.y + el.h },
    { x: el.x, y: el.y },
  ];
}

function ellipsePoints(el: Extract<DrawElement, { type: 'ellipse' }>): Point[] {
  const circumference = Math.PI * (3 * (el.rx + el.ry) - Math.sqrt((3 * el.rx + el.ry) * (el.rx + 3 * el.ry)));
  const steps = Math.max(36, Math.ceil(circumference / 5));
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * 2 * i) / steps;
    pts.push({
      x: el.cx + Math.cos(t) * el.rx,
      y: el.cy + Math.sin(t) * el.ry,
    });
  }
  return pts;
}

function linePoints(el: Extract<DrawElement, { type: 'line' } | { type: 'arrow' }>): Point[] {
  return [el.from, el.to];
}

function arrowHeadPoints(el: Extract<DrawElement, { type: 'arrow' }>): Point[][] {
  const dx = el.to.x - el.from.x;
  const dy = el.to.y - el.from.y;
  const angle = Math.atan2(dy, dx);
  const shaftLen = Math.hypot(dx, dy);
  const headLen = Math.min(24, Math.max(8, shaftLen * 0.18));
  const wing = Math.PI / 6;

  const left: Point = {
    x: el.to.x - Math.cos(angle - wing) * headLen,
    y: el.to.y - Math.sin(angle - wing) * headLen,
  };
  const right: Point = {
    x: el.to.x - Math.cos(angle + wing) * headLen,
    y: el.to.y - Math.sin(angle + wing) * headLen,
  };

  return [
    [left, el.to],
    [right, el.to],
  ];
}

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

function escapePlainTextForTex(input: string): string {
  return input.replace(/([\\{}$&#_^%~])/g, '\\$1');
}

function looksMathLikeText(input: string): boolean {
  const value = input.trim();
  if (!value) return false;
  if (/\\[a-zA-Z]+/.test(value)) return true;
  if (/[=±]/.test(value) && /[+\-*/^]/.test(value)) return true;
  if (/(?<!\\)[\^_](\{[^}]+\}|[A-Za-z0-9])/.test(value)) return true;
  return false;
}

function strokesBounds(strokes: StrokeTrajectory[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
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

function resolveSourceElementId(strokeElementId: string, elementIdsSorted: string[]): string | null {
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
  const sourceIds = [...elementOrder.keys()].sort((a, b) => b.length - a.length);

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

    for (const prev of placed) {
      const overlapX = horizontalOverlapPx(group.bounds, prev.bounds);
      if (overlapX < 10) continue;

      const dynamicGap = Math.min(
        34,
        Math.max(group.bounds.height, prev.bounds.height) * 0.2,
      );
      const minGap = Math.max(group.type === 'latex' || prev.type === 'latex' ? 14 : 10, dynamicGap);
      const needed = prev.bounds.maxY + minGap - (group.bounds.minY + requiredDy);
      if (needed > requiredDy) requiredDy = needed;
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

export async function compileBatchToStrokes(
  batch: DrawBatch,
): Promise<{ strokes: StrokeTrajectory[]; warnings: string[]; clear: boolean }> {
  const warnings: string[] = [];
  const strokes: StrokeTrajectory[] = [];
  const preset = batch.style_preset ?? 'clean_pen_sketch';

  let clear = false;

  for (const element of batch.elements) {
    const color = element.color ?? DEFAULT_COLOR;
    const baseWidth = strokeWidthForPreset(preset, element.stroke_width ?? DEFAULT_BASE_WIDTH);

    if (element.type === 'clear') {
      clear = true;
      continue;
    }

    if (element.type === 'rect') {
      const points = withJitter(resamplePolyline(rectPoints(element), 4), element.id, preset);
      strokes.push({ id: `${element.id}-rect`, elementId: element.id, points, color, baseWidth });
      continue;
    }

    if (element.type === 'ellipse') {
      const points = withJitter(resamplePolyline(ellipsePoints(element), 4), element.id, preset);
      strokes.push({ id: `${element.id}-ellipse`, elementId: element.id, points, color, baseWidth });
      continue;
    }

    if (element.type === 'line') {
      const points = withJitter(resamplePolyline(linePoints(element), 3), element.id, preset);
      strokes.push({ id: `${element.id}-line`, elementId: element.id, points, color, baseWidth });
      continue;
    }

    if (element.type === 'arrow') {
      const main = withJitter(resamplePolyline(linePoints(element), 3), `${element.id}-main`, preset);
      strokes.push({ id: `${element.id}-arrow-main`, elementId: element.id, points: main, color, baseWidth });
      const heads = arrowHeadPoints(element);
      heads.forEach((head, idx) => {
        strokes.push({
          id: `${element.id}-arrow-head-${idx}`,
          elementId: element.id,
          points: withJitter(resamplePolyline(head, 3), `${element.id}-head-${idx}`, preset),
          color,
          baseWidth,
        });
      });
      continue;
    }

    if (element.type === 'text') {
      let recovered = false;
      const beforeCount = strokes.length;

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
            const lines = segment.value.split('\n');
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

        recovered = strokes.length > beforeCount;
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
        warnings.push(`Text render fallback for element ${element.id}`);
      }
      continue;
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
    }
  }

  normalizeTextVerticalSpacing(batch, strokes);

  // Compute bounding boxes for viewport culling (after normalization shifts)
  for (const stroke of strokes) {
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

  return { strokes, warnings, clear };
}
