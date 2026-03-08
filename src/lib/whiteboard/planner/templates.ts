import type {
  ArrowElement,
  DrawElement,
  Point,
  SemanticAnnotationBlock,
  SemanticBatch,
  SemanticCaptionBlock,
  SemanticDiagramPanelBlock,
  SemanticEquationLine,
  SemanticEquationStackBlock,
  SemanticGraphNodeBlock,
  SemanticGraphEdgeBlock,
  StructuredWhiteboardContext,
  StylePreset,
} from '@/types/agent';
import type { PlannedSemanticLayout, PlannerAnchor, PlannerRegion } from './types';
import type { PlannerTraceContext } from './trace';
import { validateSemanticBatchInput } from './validate-input';

const MAX_BLOCKS = 8;
const MAX_EQUATION_LINES = 6;
const MAX_PANEL_SHAPES = 5;
const MAX_PANEL_CAPTIONS = 2;

function choosePreset(style: StylePreset | undefined): StylePreset {
  return style ?? 'clean_pen_sketch';
}

import { clamp } from '@/lib/whiteboard/geometry';

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeSpaces(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function compactText(input: string | undefined, maxChars: number): string | undefined {
  if (!input) return undefined;
  const text = normalizeSpaces(input);
  if (!text) return undefined;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function buildDefaultRegions(context?: StructuredWhiteboardContext): Record<string, PlannerRegion> {
  const suggested = context?.suggested_next_regions;
  const primary = suggested?.[0];
  const baseX = primary ? primary.x : 64;
  const baseY = primary ? primary.y : 80;
  const baseW = primary ? Math.max(980, primary.w) : 1320;
  const topH = 380;

  const laneGap = 56;

  // When multiple suggested regions exist, use them to inform left/right bounds
  const sugLeft = suggested?.[1]; // below_left
  const sugRight = suggested?.[2]; // below_right
  const leftW = sugLeft
    ? Math.max(420, sugLeft.w)
    : Math.max(420, Math.floor((baseW - laneGap) / 2));
  const leftX = sugLeft ? sugLeft.x : baseX;
  const rightW = sugRight
    ? Math.max(420, sugRight.w)
    : Math.max(420, baseW - leftW - laneGap);
  const rightX = sugRight ? sugRight.x : leftX + leftW + laneGap;
  const centerW = Math.max(560, Math.floor(baseW * 0.66));

  return {
    left: { name: 'left', x: leftX, y: baseY, w: leftW, h: topH, score: 1 },
    right: { name: 'right', x: rightX, y: baseY, w: rightW, h: topH, score: 0.94 },
    center: {
      name: 'center',
      x: baseX + Math.floor((baseW - centerW) / 2),
      y: baseY,
      w: centerW,
      h: topH,
      score: 0.9,
    },
    bottom: { name: 'bottom', x: baseX, y: baseY + topH + 74, w: baseW, h: 560, score: 0.88 },
  };
}

interface BuildState {
  elements: DrawElement[];
  anchors: PlannerAnchor[];
  warnings: string[];
}

interface PanelPlacement {
  blockId: string;
  center: Point;
  entry: Point;
  exit: Point;
  bottomY: number;
}

interface Lane {
  name: 'left' | 'right' | 'center' | 'bottom';
  region: PlannerRegion;
  cursorY: number;
}

function pushElement(state: BuildState, element: DrawElement): void {
  state.elements.push(element);
}

function pushAnchor(state: BuildState, id: string, point: Point, role: string): void {
  state.anchors.push({ id, point, role });
}

function wrapPlainText(text: string, maxChars: number): string[] {
  if (!text.trim()) return [''];
  const target = Math.max(18, maxChars);
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = words[0] ?? '';

  for (let i = 1; i < words.length; i++) {
    const next = words[i]!;
    if ((current + ' ' + next).length <= target) {
      current += ` ${next}`;
      continue;
    }
    lines.push(current);
    current = next;
  }
  lines.push(current);
  return lines;
}

function pushWrappedText(
  state: BuildState,
  idPrefix: string,
  x: number,
  y: number,
  text: string,
  size: number,
  regionWidth: number,
): number {
  const avgCharPx = Math.max(8, size * 0.5);
  const maxChars = Math.max(16, Math.floor((regionWidth - 24) / avgCharPx));
  const lines = wrapPlainText(text, maxChars);
  let cursor = y;
  for (let i = 0; i < lines.length; i++) {
    pushElement(state, {
      id: `${idPrefix}-line-${i}`,
      type: 'text',
      x,
      y: cursor,
      text: lines[i] ?? '',
      size,
    });
    cursor += Math.max(23, Math.floor(size * 1.24));
  }
  return cursor;
}

function estimateLatexVerticalAdvance(line: SemanticEquationLine, fontSize: number): number {
  const tex = line.tex;
  const fracCount = (tex.match(/\\(?:d?frac|tfrac)\b/g) ?? []).length;
  const rootCount = (tex.match(/\\sqrt\b/g) ?? []).length;
  const sumLikeCount = (tex.match(/\\(?:sum|prod|int|lim)\b/g) ?? []).length;
  const matrixLikeCount = (tex.match(/\\(?:begin\{[^}]*matrix\}|begin\{array\}|cases|aligned|align)\b/g) ?? [])
    .length;
  const scriptCount = (tex.match(/[\^_]/g) ?? []).length;
  const explicitBreaks = (tex.match(/\\\\/g) ?? []).length;

  const displayMode = line.displayMode ?? true;
  const base = displayMode ? fontSize * 1.72 : fontSize * 1.38;
  const extra =
    fracCount * fontSize * 0.45 +
    rootCount * fontSize * 0.15 +
    sumLikeCount * fontSize * 0.2 +
    matrixLikeCount * fontSize * 1.1 +
    Math.min(fontSize * 0.5, scriptCount * fontSize * 0.04) +
    explicitBreaks * fontSize * 0.9;

  const floor = displayMode ? Math.max(62, fontSize * 1.95) : Math.max(44, fontSize * 1.45);
  return Math.max(floor, base + extra);
}

export function measureEquationStack(
  block: SemanticEquationStackBlock,
  regionWidth: number,
): { width: number; height: number } {
  let h = 0;
  if (block.title) {
    const avgCharPx = Math.max(8, 22 * 0.5);
    const maxChars = Math.max(16, Math.floor((regionWidth - 24) / avgCharPx));
    const titleLines = wrapPlainText(block.title, maxChars);
    h += titleLines.length * Math.max(23, Math.floor(22 * 1.24)) + 8;
  }
  for (const line of block.lines) {
    const role = line.role ?? 'step';
    const fontSize = role === 'result' ? 28 : role === 'note' ? 20 : 24;
    h += estimateLatexVerticalAdvance(line, fontSize) + 12;
  }
  return { width: regionWidth, height: h };
}

export function measureDiagramPanel(
  block: SemanticDiagramPanelBlock,
  regionWidth: number,
): { width: number; height: number } {
  let h = 0;
  if (block.title) {
    const avgCharPx = Math.max(8, 22 * 0.5);
    const maxChars = Math.max(16, Math.floor((regionWidth - 24) / avgCharPx));
    const titleLines = wrapPlainText(block.title, maxChars);
    h += titleLines.length * Math.max(23, Math.floor(22 * 1.24)) + 6;
  }
  h += Math.max(210, 336);
  return { width: regionWidth, height: h };
}

export function measureCaptionBlock(
  block: SemanticCaptionBlock,
  regionWidth: number,
): { width: number; height: number } {
  const w = regionWidth - 20;
  const avgCharPx = Math.max(8, 20 * 0.5);
  const maxChars = Math.max(16, Math.floor((w - 24) / avgCharPx));
  const lines = wrapPlainText(block.text, maxChars);
  const h = lines.length * Math.max(23, Math.floor(20 * 1.24)) + 10;
  return { width: w, height: h };
}

export function measureAnnotationBlock(
  block: SemanticAnnotationBlock,
  regionWidth: number,
): { width: number; height: number } {
  const w = Math.min(regionWidth * 0.5, 260);
  const avgCharPx = Math.max(8, 16 * 0.5);
  const maxChars = Math.max(16, Math.floor((w - 20) / avgCharPx));
  const lines = wrapPlainText(block.text, maxChars);
  const h = lines.length * Math.max(23, Math.floor(16 * 1.24)) + 10;
  return { width: w, height: h };
}

export function measureBlock(
  block: SemanticBatch['blocks'][number],
  regionWidth: number,
): { width: number; height: number } {
  if (block.kind === 'equation_stack') return measureEquationStack(block, regionWidth);
  if (block.kind === 'diagram_panel') return measureDiagramPanel(block, regionWidth);
  if (block.kind === 'annotation') return measureAnnotationBlock(block, regionWidth);
  return measureCaptionBlock(block, regionWidth);
}

function placeEquationStack(
  block: SemanticEquationStackBlock,
  region: PlannerRegion,
  state: BuildState,
  startY: number,
): number {
  let y = startY;
  const align = block.align ?? 'left';
  const xLeft = region.x + 16;
  const xCenter = region.x + region.w / 2;
  const x = align === 'center' ? xCenter : xLeft;

  if (block.title) {
    y = pushWrappedText(state, `${block.id}-title`, xLeft, y, block.title, 22, region.w);
    y += 8;
  }

  for (let i = 0; i < block.lines.length; i++) {
    const line = block.lines[i]!;
    const role = line.role ?? 'step';
    const fontSize = role === 'result' ? 28 : role === 'note' ? 20 : 24;

    pushElement(state, {
      id: `${block.id}-line-${line.id || i}`,
      type: 'latex',
      x,
      y,
      tex: line.tex,
      displayMode: line.displayMode ?? true,
      fontSize,
      align,
    });
    pushAnchor(state, `${block.id}-anchor-${i}`, { x, y }, 'equation_line');

    y += estimateLatexVerticalAdvance(line, fontSize) + 12;
  }

  return y;
}

function addAxes(
  blockId: string,
  region: PlannerRegion,
  xLabel: string,
  yLabel: string,
  state: BuildState,
): { origin: Point; xEnd: Point; yEnd: Point } {
  const origin = { x: region.x + Math.max(48, region.w * 0.16), y: region.y + region.h - 34 };
  const xEnd = { x: region.x + region.w - 22, y: origin.y };
  const yEnd = { x: origin.x, y: region.y + 22 };

  const xAxis: ArrowElement = {
    id: `${blockId}-x-axis`,
    type: 'arrow',
    from: origin,
    to: xEnd,
  };
  const yAxis: ArrowElement = {
    id: `${blockId}-y-axis`,
    type: 'arrow',
    from: origin,
    to: yEnd,
  };

  pushElement(state, xAxis);
  pushElement(state, yAxis);
  pushElement(state, {
    id: `${blockId}-x-label`,
    type: 'text',
    x: xEnd.x + 8,
    y: xEnd.y + 1,
    text: xLabel,
    size: 18,
  });
  pushElement(state, {
    id: `${blockId}-y-label`,
    type: 'text',
    x: yEnd.x - 12,
    y: yEnd.y - 10,
    text: yLabel,
    size: 18,
  });

  pushAnchor(state, `${blockId}-origin`, origin, 'axis_origin');
  pushAnchor(state, `${blockId}-x-end`, xEnd, 'axis_x_positive');
  pushAnchor(state, `${blockId}-y-end`, yEnd, 'axis_y_positive');

  return { origin, xEnd, yEnd };
}

function placePanelShape(
  panelId: string,
  shape: NonNullable<SemanticDiagramPanelBlock['shapes']>[number],
  region: PlannerRegion,
  state: BuildState,
): void {
  const rp = shape.relative_pose;
  const x = region.x + clamp01(rp?.x ?? 0.56) * region.w;
  const y = region.y + clamp01(rp?.y ?? 0.5) * region.h;
  const w = Math.max(52, (rp?.w ?? 0.3) * region.w);
  const h = Math.max(52, (rp?.h ?? 0.3) * region.h);
  const rotationDeg = rp?.rotation_deg ?? (shape.type === 'parallelogram' ? 11 : 0);

  if (shape.type === 'rect') {
    const left = x - w / 2;
    const right = x + w / 2;
    const top = y - h / 2;
    const bottom = y + h / 2;
    pushElement(state, {
      id: `${panelId}-${shape.id}`,
      type: 'rect',
      x: left,
      y: top,
      w,
      h,
    });
    pushAnchor(state, `${panelId}-${shape.id}-center`, { x, y }, 'shape_center');
    pushAnchor(state, `${panelId}-${shape.id}-top`, { x, y: top }, 'shape_top');
    pushAnchor(state, `${panelId}-${shape.id}-bottom`, { x, y: bottom }, 'shape_bottom');
    pushAnchor(state, `${panelId}-${shape.id}-left`, { x: left, y }, 'shape_left');
    pushAnchor(state, `${panelId}-${shape.id}-right`, { x: right, y }, 'shape_right');
  } else if (shape.type === 'parallelogram') {
    const slant = Math.tan((rotationDeg * Math.PI) / 180) * (h * 0.34);
    const p1 = { x: x - w / 2 + slant, y: y - h / 2 };
    const p2 = { x: x + w / 2 + slant, y: y - h / 2 };
    const p3 = { x: x + w / 2 - slant, y: y + h / 2 };
    const p4 = { x: x - w / 2 - slant, y: y + h / 2 };
    pushElement(state, { id: `${panelId}-${shape.id}-e1`, type: 'line', from: p1, to: p2 });
    pushElement(state, { id: `${panelId}-${shape.id}-e2`, type: 'line', from: p2, to: p3 });
    pushElement(state, { id: `${panelId}-${shape.id}-e3`, type: 'line', from: p3, to: p4 });
    pushElement(state, { id: `${panelId}-${shape.id}-e4`, type: 'line', from: p4, to: p1 });
    const center = { x: (p1.x + p2.x + p3.x + p4.x) / 4, y: (p1.y + p2.y + p3.y + p4.y) / 4 };
    pushAnchor(state, `${panelId}-${shape.id}-center`, center, 'shape_center');
    pushAnchor(state, `${panelId}-${shape.id}-top`, { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, 'shape_top');
    pushAnchor(state, `${panelId}-${shape.id}-bottom`, { x: (p3.x + p4.x) / 2, y: (p3.y + p4.y) / 2 }, 'shape_bottom');
    pushAnchor(state, `${panelId}-${shape.id}-left`, { x: (p1.x + p4.x) / 2, y: (p1.y + p4.y) / 2 }, 'shape_left');
    pushAnchor(state, `${panelId}-${shape.id}-right`, { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 }, 'shape_right');
    pushAnchor(state, `${panelId}-${shape.id}-tl`, p1, 'shape_corner_tl');
    pushAnchor(state, `${panelId}-${shape.id}-tr`, p2, 'shape_corner_tr');
    pushAnchor(state, `${panelId}-${shape.id}-br`, p3, 'shape_corner_br');
    pushAnchor(state, `${panelId}-${shape.id}-bl`, p4, 'shape_corner_bl');
  } else if (shape.type === 'line' || shape.type === 'arrow') {
    const from = { x: x - w / 2, y: y + h * 0.12 };
    const to = { x: x + w / 2, y: y - h * 0.12 };
    pushElement(state, {
      id: `${panelId}-${shape.id}`,
      type: shape.type,
      from,
      to,
    });
    pushAnchor(state, `${panelId}-${shape.id}-start`, from, 'shape_start');
    pushAnchor(state, `${panelId}-${shape.id}-end`, to, 'shape_end');
    pushAnchor(state, `${panelId}-${shape.id}-center`, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 'shape_center');
  }

  if (shape.label) {
    pushWrappedText(
      state,
      `${panelId}-${shape.id}-label`,
      x - w * 0.32,
      y + h / 2 + 20,
      shape.label,
      18,
      w * 1.26,
    );
  }

}

function placeDiagramPanel(
  block: SemanticDiagramPanelBlock,
  region: PlannerRegion,
  state: BuildState,
  startY: number,
): PanelPlacement {
  let y = startY;
  const xPad = 8;

  if (block.title) {
    y = pushWrappedText(state, `${block.id}-title`, region.x + xPad, y, block.title, 22, region.w - xPad * 2);
    y += 6;
  }

  const panelRegion = {
    ...region,
    y,
    h: Math.max(210, region.h - (y - region.y) - 18),
  };

  const axes = addAxes(block.id, panelRegion, block.axes?.x_label ?? 'x', block.axes?.y_label ?? 'y', state);

  const shapes = block.shapes && block.shapes.length > 0
    ? block.shapes
    : [
        {
          id: `${block.id}-default-shape`,
          type: 'rect' as const,
          relative_pose: { x: 0.56, y: 0.5, w: 0.28, h: 0.28 },
        },
      ];
  shapes.forEach((shape) => placePanelShape(block.id, shape, panelRegion, state));

  block.captions?.forEach((caption) => {
    let cx = panelRegion.x + 10;
    let cy = panelRegion.y + panelRegion.h + 24;
    const captionWidth = Math.max(160, panelRegion.w * 0.72);
    if (caption.anchor === 'top') cy = panelRegion.y - 26;
    if (caption.anchor === 'center') {
      cx = panelRegion.x + panelRegion.w * 0.2;
      cy = panelRegion.y + panelRegion.h * 0.54;
    } else if (caption.anchor === 'left') {
      cx = panelRegion.x - Math.min(116, panelRegion.w * 0.3);
      cy = panelRegion.y + panelRegion.h * 0.52;
    } else if (caption.anchor === 'right') {
      cx = panelRegion.x + panelRegion.w + 12;
      cy = panelRegion.y + panelRegion.h * 0.52;
    }
    pushWrappedText(state, `${block.id}-caption-${caption.id}`, cx, cy, caption.text, 18, captionWidth);
  });

  const center = { x: (axes.origin.x + axes.xEnd.x) / 2, y: (axes.origin.y + axes.yEnd.y) / 2 };
  pushAnchor(state, `${block.id}-panel-center`, center, 'panel_center');

  return {
    blockId: block.id,
    center,
    entry: { x: panelRegion.x - 10, y: panelRegion.y + panelRegion.h * 0.44 },
    exit: { x: panelRegion.x + panelRegion.w + 10, y: panelRegion.y + panelRegion.h * 0.44 },
    bottomY: panelRegion.y + panelRegion.h + 56,
  };
}

function placeCaptionBlock(
  block: SemanticCaptionBlock,
  region: PlannerRegion,
  state: BuildState,
  startY: number,
): number {
  const y = pushWrappedText(
    state,
    `${block.id}-caption`,
    region.x + 10,
    startY,
    block.text,
    20,
    region.w - 20,
  );
  return y + 10;
}

function placeAnnotationBlock(
  block: SemanticAnnotationBlock,
  targetPos: PanelPlacement,
  state: BuildState,
): void {
  const style = block.style ?? 'callout';
  let textX: number;
  let textY: number;
  let arrowFrom: Point;
  let arrowTo: Point;

  if (style === 'underline') {
    textX = targetPos.center.x - 60;
    textY = targetPos.bottomY + 8;
    arrowFrom = { x: textX, y: textY - 4 };
    arrowTo = { x: targetPos.center.x, y: targetPos.bottomY - 4 };
  } else if (style === 'bracket') {
    textX = targetPos.entry.x - 20;
    textY = targetPos.center.y;
    arrowFrom = { x: textX + 10, y: textY - 6 };
    arrowTo = { x: targetPos.entry.x + 4, y: targetPos.center.y };
  } else {
    // callout: position to the right of the target
    textX = targetPos.exit.x + 24;
    textY = targetPos.center.y - 10;
    arrowFrom = { x: textX - 4, y: textY + 8 };
    arrowTo = { x: targetPos.exit.x + 4, y: targetPos.center.y };
  }

  pushElement(state, {
    id: `${block.id}-arrow`,
    type: 'arrow',
    from: arrowFrom,
    to: arrowTo,
  });
  pushWrappedText(state, `${block.id}-text`, textX, textY, block.text, 16, 220);
}

function diagramHintWeight(block: SemanticDiagramPanelBlock): number {
  if (block.region_hint === 'left') return 0;
  if (block.region_hint === 'center') return 1;
  if (block.region_hint === 'right') return 2;
  return 3;
}

function choosePanelColumns(panelCount: number): number {
  if (panelCount <= 1) return 1;
  if (panelCount <= 4) return 2;
  return 3;
}

function compactSemanticBatchForLegibility(
  semanticBatch: SemanticBatch,
  warnings: string[],
): SemanticBatch {
  const compactedBlocks: SemanticBatch['blocks'] = [];

  for (const block of semanticBatch.blocks) {
    if (compactedBlocks.length >= MAX_BLOCKS) {
      warnings.push('Trimmed extra semantic blocks for visual legibility');
      break;
    }

    if (block.kind === 'equation_stack') {
      const title = compactText(block.title, 54);
      const lines = block.lines
        .map((line) => ({
          ...line,
          tex: compactText(line.tex, 220) ?? '',
        }))
        .filter((line) => line.tex.length > 0)
        .slice(0, MAX_EQUATION_LINES);

      if (block.lines.length > MAX_EQUATION_LINES) {
        warnings.push(`Equation stack ${block.id} trimmed to ${MAX_EQUATION_LINES} lines`);
      }
      if (lines.length === 0) continue;

      compactedBlocks.push({
        ...block,
        ...(title ? { title } : {}),
        lines,
      });
      continue;
    }

    if (block.kind === 'diagram_panel') {
      const title = compactText(block.title, 48);
      const shapes = block.shapes
        ?.slice(0, MAX_PANEL_SHAPES)
        .map((shape) => ({
          ...shape,
          ...(shape.label ? { label: compactText(shape.label, 32) } : {}),
          ...(shape.relative_pose
            ? {
                relative_pose: {
                  x: clamp(shape.relative_pose.x, 0.04, 0.96),
                  y: clamp(shape.relative_pose.y, 0.04, 0.96),
                  ...(shape.relative_pose.w == null ? {} : { w: clamp(shape.relative_pose.w, 0.1, 0.82) }),
                  ...(shape.relative_pose.h == null ? {} : { h: clamp(shape.relative_pose.h, 0.1, 0.82) }),
                  ...(shape.relative_pose.rotation_deg == null
                    ? {}
                    : { rotation_deg: shape.relative_pose.rotation_deg }),
                },
              }
            : {}),
        }))
        .map((shape) => ({
          ...shape,
          ...(shape.label ? { label: shape.label } : {}),
        }));

      if (block.shapes && block.shapes.length > MAX_PANEL_SHAPES) {
        warnings.push(`Diagram panel ${block.id} trimmed to ${MAX_PANEL_SHAPES} shapes`);
      }

      const captions = block.captions
        ?.slice(0, MAX_PANEL_CAPTIONS)
        .map((caption) => ({
          ...caption,
          text: compactText(caption.text, 44) ?? caption.text,
        }));

      compactedBlocks.push({
        ...block,
        ...(title ? { title } : {}),
        ...(shapes && shapes.length > 0 ? { shapes } : {}),
        ...(captions && captions.length > 0 ? { captions } : {}),
      });
      continue;
    }

    if (block.kind === 'annotation') {
      const text = compactText(block.text, 60);
      if (!text) continue;
      compactedBlocks.push({ ...block, text });
      continue;
    }

    const text = compactText(block.text, 74);
    if (!text) continue;
    compactedBlocks.push({
      ...block,
      text,
    });
  }

  const idSet = new Set(compactedBlocks.map((block) => block.id));

  // Drop annotation blocks whose target was removed during compaction
  const validBlocks = compactedBlocks.filter((block) => {
    if (block.kind !== 'annotation') return true;
    if (idSet.has(block.target_block_id)) return true;
    warnings.push(`Annotation ${block.id} target ${block.target_block_id} not found`);
    return false;
  });

  const relations =
    semanticBatch.relations
      ?.filter((relation) => idSet.has(relation.from_block_id) && idSet.has(relation.to_block_id))
      .map((relation) => ({
        ...relation,
        ...(relation.label ? { label: compactText(relation.label, 24) } : {}),
      })) ?? [];

  return {
    ...semanticBatch,
    blocks:
      validBlocks.length > 0
        ? validBlocks
        : [
            {
              id: `fallback-${semanticBatch.batch_id}`,
              kind: 'caption',
              text: 'No drawable semantic blocks produced.',
              region_hint: 'bottom',
            },
          ],
    ...(relations.length > 0 ? { relations } : {}),
  };
}

function buildTextLanes(
  baseRegion: PlannerRegion,
  panelColumns: Array<{ x: number; w: number }>,
  textStartY: number,
): Record<Lane['name'], Lane> {
  const topTextY = textStartY;

  if (panelColumns.length >= 2) {
    const [leftCol, rightCol] = panelColumns as [{ x: number; w: number }, { x: number; w: number }, ...Array<{ x: number; w: number }>];
    return {
      left: {
        name: 'left',
        region: { ...baseRegion, x: leftCol.x, y: topTextY, w: leftCol.w, h: baseRegion.h, score: 1 },
        cursorY: topTextY,
      },
      right: {
        name: 'right',
        region: { ...baseRegion, x: rightCol.x, y: topTextY, w: rightCol.w, h: baseRegion.h, score: 1 },
        cursorY: topTextY,
      },
      center: {
        name: 'center',
        region: {
          ...baseRegion,
          x: baseRegion.x + baseRegion.w * 0.16,
          y: topTextY,
          w: baseRegion.w * 0.68,
          h: baseRegion.h,
          score: 1,
        },
        cursorY: topTextY,
      },
      bottom: {
        name: 'bottom',
        region: {
          ...baseRegion,
          x: baseRegion.x,
          y: topTextY,
          w: baseRegion.w,
          h: baseRegion.h,
          score: 1,
        },
        cursorY: topTextY,
      },
    };
  }

  // When there are fewer than 2 panel columns, create distinct non-overlapping
  // lane regions instead of giving all lanes the same spatial bounds.
  const laneGap = 40;
  const leftW = Math.max(280, Math.floor((baseRegion.w - laneGap) / 2));
  const rightW = Math.max(280, baseRegion.w - leftW - laneGap);

  return {
    left: {
      name: 'left',
      region: { ...baseRegion, x: baseRegion.x, y: topTextY, w: leftW, h: baseRegion.h, score: 1 },
      cursorY: topTextY,
    },
    right: {
      name: 'right',
      region: { ...baseRegion, x: baseRegion.x + leftW + laneGap, y: topTextY, w: rightW, h: baseRegion.h, score: 1 },
      cursorY: topTextY,
    },
    center: {
      name: 'center',
      region: {
        ...baseRegion,
        x: baseRegion.x + baseRegion.w * 0.08,
        y: topTextY,
        w: baseRegion.w * 0.84,
        h: baseRegion.h,
        score: 1,
      },
      cursorY: topTextY,
    },
    bottom: {
      name: 'bottom',
      region: {
        ...baseRegion,
        x: baseRegion.x,
        y: topTextY,
        w: baseRegion.w,
        h: baseRegion.h,
        score: 1,
      },
      cursorY: topTextY,
    },
  };
}

function chooseLaneForBlock(
  block: SemanticBatch['blocks'][number],
  lanes: Record<Lane['name'], Lane>,
  contentHeights?: Record<string, number>,
): Lane {
  const hint =
    block.kind === 'caption'
      ? (block.region_hint ?? 'bottom')
      : block.kind === 'equation_stack'
        ? (block.region_hint ?? 'auto')
        : 'auto';

  if (hint === 'left') return lanes.left;
  if (hint === 'right') return lanes.right;
  if (hint === 'center') return lanes.center;
  if (hint === 'bottom') {
    // Don't mutate cursorY during selection — the caller advances cursorY
    // after placement. Just ensure bottom starts below other lanes.
    return lanes.bottom;
  }

  const candidates = [lanes.left, lanes.right, lanes.center];
  const minY = Math.min(...candidates.map((l) => l.cursorY));
  const threshold = 30;
  const tied = candidates.filter((l) => l.cursorY - minY <= threshold);

  if (tied.length > 1 && contentHeights) {
    // Break tie by choosing the lane that best balances left vs right height
    let bestLane = tied[0] ?? candidates[0];
    let bestImbalance = Infinity;
    for (const lane of tied) {
      const leftH = contentHeights['left'] ?? 0;
      const rightH = contentHeights['right'] ?? 0;
      const addLeft = lane.name === 'left' ? 1 : 0;
      const addRight = lane.name === 'right' ? 1 : 0;
      const imbalance = Math.abs((leftH + addLeft) - (rightH + addRight));
      if (imbalance < bestImbalance) {
        bestImbalance = imbalance;
        bestLane = lane;
      }
    }
    return bestLane;
  }

  return tied[0] ?? candidates.reduce((best, lane) => (lane.cursorY < best.cursorY ? lane : best));
}

function findAnchorPoint(anchors: PlannerAnchor[], id: string | undefined): Point | null {
  if (!id) return null;
  const match = anchors.find((anchor) => anchor.id === id);
  return match?.point ?? null;
}

function buildAdaptiveLayout(
  semanticBatch: SemanticBatch,
  regions: Record<string, PlannerRegion>,
  state: BuildState,
): void {
  const baseRegion: PlannerRegion = {
    name: 'adaptive-base',
    x: regions.left.x,
    y: regions.left.y,
    w: regions.bottom.w,
    h: regions.bottom.y + regions.bottom.h - regions.left.y,
    score: 1,
  };

  const diagramBlocks = semanticBatch.blocks
    .filter((block): block is SemanticDiagramPanelBlock => block.kind === 'diagram_panel')
    .sort((a, b) => diagramHintWeight(a) - diagramHintWeight(b));
  const annotationBlocks = semanticBatch.blocks
    .filter((block): block is SemanticAnnotationBlock => block.kind === 'annotation');
  const textBlocks = semanticBatch.blocks.filter(
    (block) => block.kind !== 'diagram_panel' && block.kind !== 'annotation',
  );

  const panelPlacements = new Map<string, PanelPlacement>();
  const panelColumns: Array<{ x: number; w: number }> = [];
  let textStartY = baseRegion.y + 8;

  if (diagramBlocks.length > 0) {
    const cols = choosePanelColumns(diagramBlocks.length);
    const gapX = cols === 1 ? 0 : 56;
    const panelWidth = Math.max(320, Math.min(540, Math.floor((baseRegion.w - gapX * (cols - 1)) / cols)));
    const panelHeight = diagramBlocks.length > cols ? 288 : 336;
    const rowGap = 70;

    for (let col = 0; col < cols; col++) {
      panelColumns.push({
        x: baseRegion.x + col * (panelWidth + gapX),
        w: panelWidth,
      });
    }

    for (let i = 0; i < diagramBlocks.length; i++) {
      const block = diagramBlocks[i]!;
      const row = Math.floor(i / cols);
      const col = i % cols;
      const colRegion = panelColumns[col]!;
      const region: PlannerRegion = {
        name: `panel-${i}`,
        x: colRegion.x,
        y: baseRegion.y + row * (panelHeight + rowGap),
        w: colRegion.w,
        h: panelHeight,
        score: 1,
      };

      const placed = placeDiagramPanel(block, region, state, region.y + 12);
      panelPlacements.set(block.id, placed);
      textStartY = Math.max(textStartY, placed.bottomY);
    }
  }

  const lanes = buildTextLanes(baseRegion, panelColumns, textStartY + (diagramBlocks.length > 0 ? 8 : 0));

  // Track text block positions so cross-type relations (panel↔equation, panel↔caption) work
  const textBlockPositions = new Map<string, PanelPlacement>();
  const contentHeights: Record<string, number> = { left: 0, right: 0, center: 0, bottom: 0 };

  for (const block of textBlocks) {
    const lane = chooseLaneForBlock(block, lanes, contentHeights);
    // Ensure bottom lane starts below all other lanes
    if (lane.name === 'bottom') {
      lane.cursorY = Math.max(
        lane.cursorY,
        lanes.left.cursorY + 16,
        lanes.right.cursorY + 16,
        lanes.center.cursorY + 16,
      );
    }
    const startY = lane.cursorY;
    if (block.kind === 'equation_stack') {
      lane.cursorY = placeEquationStack(block, lane.region, state, lane.cursorY);
      lane.cursorY += 14;
    } else {
      lane.cursorY = placeCaptionBlock(block, lane.region, state, lane.cursorY);
    }
    contentHeights[lane.name] = (contentHeights[lane.name] ?? 0) + (lane.cursorY - startY);
    const midY = (startY + lane.cursorY) / 2;
    const midX = lane.region.x + lane.region.w / 2;
    textBlockPositions.set(block.id, {
      blockId: block.id,
      center: { x: midX, y: midY },
      entry: { x: lane.region.x - 10, y: midY },
      exit: { x: lane.region.x + lane.region.w + 10, y: midY },
      bottomY: lane.cursorY,
    });
  }

  // Place annotation blocks attached to their targets (don't consume lanes)
  for (const block of annotationBlocks) {
    const targetPos =
      panelPlacements.get(block.target_block_id) ?? textBlockPositions.get(block.target_block_id);
    if (!targetPos) {
      state.warnings.push(`Annotation ${block.id} target ${block.target_block_id} not found`);
      continue;
    }
    placeAnnotationBlock(block, targetPos, state);
  }

  // Render relations between ANY block types (panel↔panel, panel↔equation, etc.)
  for (const relation of semanticBatch.relations ?? []) {
    const from = panelPlacements.get(relation.from_block_id) ?? textBlockPositions.get(relation.from_block_id);
    const to = panelPlacements.get(relation.to_block_id) ?? textBlockPositions.get(relation.to_block_id);
    if (!from || !to) continue;

    const fromAnchor = findAnchorPoint(state.anchors, relation.from_anchor);
    const toAnchor = findAnchorPoint(state.anchors, relation.to_anchor);

    const arrowFrom = fromAnchor ??
      (from.center.x < to.center.x
        ? { x: from.exit.x, y: from.center.y - 6 }
        : { x: from.entry.x, y: from.center.y - 6 });
    const arrowTo = toAnchor ??
      (from.center.x < to.center.x
        ? { x: to.entry.x, y: to.center.y - 6 }
        : { x: to.exit.x, y: to.center.y - 6 });

    pushElement(state, {
      id: relation.id,
      type: 'arrow',
      from: arrowFrom,
      to: arrowTo,
    });
    if (relation.label) {
      const midX = (arrowFrom.x + arrowTo.x) / 2;
      const midY = (arrowFrom.y + arrowTo.y) / 2;
      const dx = arrowTo.x - arrowFrom.x;
      const dy = arrowTo.y - arrowFrom.y;
      // Offset label perpendicular to arrow direction for readability
      const isMoreVertical = Math.abs(dy) > Math.abs(dx);
      const labelX = isMoreVertical ? midX + 8 : midX - 20;
      const labelY = isMoreVertical ? midY : midY - 14;
      pushElement(state, {
        id: `${relation.id}-label`,
        type: 'text',
        x: labelX,
        y: labelY,
        text: relation.label,
        size: 20,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// graph_diagram template — node-and-edge diagrams
// ---------------------------------------------------------------------------

const DEFAULT_NODE_RADIUS = 30;
const DEFAULT_NODE_SIZE = 60; // width/height for rect/square/diamond

interface ResolvedNode {
  id: string;
  label: string;
  shape: NonNullable<SemanticGraphNodeBlock['shape']>;
  x: number;
  y: number;
  color?: string;
}

function autoLayoutNodes(nodes: SemanticGraphNodeBlock[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const count = nodes.length;
  if (count === 0) return positions;

  if (count <= 6) {
    // Circular layout centered at (700, 350) with r=200
    const cx = 700;
    const cy = 350;
    const r = 200;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      positions.set(nodes[i]!.id, {
        x: Math.round(cx + r * Math.cos(angle)),
        y: Math.round(cy + r * Math.sin(angle)),
      });
    }
  } else {
    // 3-column grid layout starting at (200, 150), spacing 250×140
    const cols = 3;
    const startX = 200;
    const startY = 150;
    const gapX = 250;
    const gapY = 140;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.set(nodes[i]!.id, {
        x: startX + col * gapX,
        y: startY + row * gapY,
      });
    }
  }
  return positions;
}

function resolveGraphNodes(blocks: SemanticGraphNodeBlock[]): ResolvedNode[] {
  const needsLayout = blocks.some((b) => b.x == null || b.y == null);
  const autoPositions = needsLayout ? autoLayoutNodes(blocks) : new Map();

  return blocks.map((b) => {
    const autoPos = autoPositions.get(b.id);
    return {
      id: b.id,
      label: b.label ?? b.id,
      shape: b.shape ?? 'circle',
      x: b.x ?? autoPos?.x ?? 400,
      y: b.y ?? autoPos?.y ?? 300,
      color: b.color,
    };
  });
}

function placeGraphNode(node: ResolvedNode, state: BuildState): void {
  const { id, label, shape, x, y, color } = node;
  const r = DEFAULT_NODE_RADIUS;
  const s = DEFAULT_NODE_SIZE;

  switch (shape) {
    case 'circle':
      pushElement(state, { id, type: 'ellipse', cx: x, cy: y, rx: r, ry: r, color });
      break;

    case 'double_circle':
      pushElement(state, { id: `${id}-outer`, type: 'ellipse', cx: x, cy: y, rx: r + 6, ry: r + 6, color });
      pushElement(state, { id, type: 'ellipse', cx: x, cy: y, rx: r, ry: r, color });
      break;

    case 'rect':
      pushElement(state, { id, type: 'rect', x: x - s / 2, y: y - s / 2 + 5, w: s * 1.4, h: s - 10, color });
      break;

    case 'square':
      pushElement(state, { id, type: 'rect', x: x - s / 2, y: y - s / 2, w: s, h: s, color });
      break;

    case 'diamond': {
      const top: Point = { x, y: y - s / 2 };
      const right: Point = { x: x + s / 2, y };
      const bottom: Point = { x, y: y + s / 2 };
      const left: Point = { x: x - s / 2, y };
      pushElement(state, { id: `${id}-d1`, type: 'line', from: top, to: right, color });
      pushElement(state, { id: `${id}-d2`, type: 'line', from: right, to: bottom, color });
      pushElement(state, { id: `${id}-d3`, type: 'line', from: bottom, to: left, color });
      pushElement(state, { id: `${id}-d4`, type: 'line', from: left, to: top, color });
      break;
    }
  }

  // Center label inside the node
  if (label) {
    const textW = label.length * 8;
    pushElement(state, {
      id: `${id}-label`,
      type: 'text',
      x: x - textW / 2,
      y: y - 7,
      text: label,
      size: 14,
      color,
    });
  }

  pushAnchor(state, `${id}-center`, { x, y }, 'node_center');
}

function nodeBoundaryPoint(node: ResolvedNode, target: Point): Point {
  const dx = target.x - node.x;
  const dy = target.y - node.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { x: node.x + DEFAULT_NODE_RADIUS, y: node.y };

  const nx = dx / dist;
  const ny = dy / dist;

  switch (node.shape) {
    case 'circle':
    case 'double_circle': {
      const r = node.shape === 'double_circle' ? DEFAULT_NODE_RADIUS + 6 : DEFAULT_NODE_RADIUS;
      return { x: node.x + nx * r, y: node.y + ny * r };
    }
    case 'rect': {
      const hw = (DEFAULT_NODE_SIZE * 1.4) / 2;
      const hh = (DEFAULT_NODE_SIZE - 10) / 2;
      const sx = Math.abs(nx) > 0.001 ? hw / Math.abs(nx) : Infinity;
      const sy = Math.abs(ny) > 0.001 ? hh / Math.abs(ny) : Infinity;
      const s = Math.min(sx, sy);
      return { x: node.x + nx * s, y: node.y + ny * s };
    }
    case 'square': {
      const hs = DEFAULT_NODE_SIZE / 2;
      const sx = Math.abs(nx) > 0.001 ? hs / Math.abs(nx) : Infinity;
      const sy = Math.abs(ny) > 0.001 ? hs / Math.abs(ny) : Infinity;
      const s = Math.min(sx, sy);
      return { x: node.x + nx * s, y: node.y + ny * s };
    }
    case 'diamond': {
      // Diamond boundary: |dx/hs| + |dy/hs| = 1
      const hs = DEFAULT_NODE_SIZE / 2;
      const s = hs / (Math.abs(nx) + Math.abs(ny) || 1);
      return { x: node.x + nx * s, y: node.y + ny * s };
    }
  }
}

function placeGraphEdge(
  edge: SemanticGraphEdgeBlock,
  nodeMap: Map<string, ResolvedNode>,
  state: BuildState,
): void {
  const fromNode = nodeMap.get(edge.from);
  const toNode = nodeMap.get(edge.to);
  if (!fromNode || !toNode) {
    state.warnings.push(`Edge ${edge.id}: missing node '${!fromNode ? edge.from : edge.to}'`);
    return;
  }

  const isSelfLoop = edge.from === edge.to;
  const directed = edge.directed ?? true;

  if (isSelfLoop) {
    // Self-loop: small ellipse arc at top of node
    const loopR = 18;
    const topY = fromNode.y - DEFAULT_NODE_RADIUS - loopR * 2;
    pushElement(state, {
      id: edge.id,
      type: 'ellipse',
      cx: fromNode.x,
      cy: topY + loopR,
      rx: loopR,
      ry: loopR,
    });
    if (directed) {
      // Small arrowhead at re-entry point
      pushElement(state, {
        id: `${edge.id}-head`,
        type: 'arrow',
        from: { x: fromNode.x + loopR - 2, y: topY + loopR + 8 },
        to: { x: fromNode.x + 4, y: fromNode.y - DEFAULT_NODE_RADIUS },
      });
    }
    if (edge.label) {
      pushElement(state, {
        id: `${edge.id}-label`,
        type: 'text',
        x: fromNode.x - edge.label.length * 4,
        y: topY - 6,
        text: edge.label,
        size: 13,
        color: edge.color,
      });
    }
    return;
  }

  if (edge.curved) {
    // Bézier-approximated curve with 5 line segments, curving to the right of direction
    const fromPt = nodeBoundaryPoint(fromNode, { x: toNode.x, y: toNode.y });
    const toPt = nodeBoundaryPoint(toNode, { x: fromNode.x, y: fromNode.y });
    const mx = (fromPt.x + toPt.x) / 2;
    const my = (fromPt.y + toPt.y) / 2;
    const dx = toPt.x - fromPt.x;
    const dy = toPt.y - fromPt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    // Perpendicular offset (right of direction)
    const perpX = len > 0 ? -dy / len : 0;
    const perpY = len > 0 ? dx / len : 0;
    const bulge = Math.min(60, len * 0.3);
    const cx = mx + perpX * bulge;
    const cy = my + perpY * bulge;

    const segments = 5;
    const pts: Point[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      // Quadratic Bézier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      pts.push({
        x: u * u * fromPt.x + 2 * u * t * cx + t * t * toPt.x,
        y: u * u * fromPt.y + 2 * u * t * cy + t * t * toPt.y,
      });
    }

    for (let i = 0; i < segments; i++) {
      const isLast = i === segments - 1;
      pushElement(state, {
        id: `${edge.id}-seg${i}`,
        type: isLast && directed ? 'arrow' : 'line',
        from: pts[i]!,
        to: pts[i + 1]!,
        color: edge.color,
      });
    }

    if (edge.label) {
      // Place label at the midpoint of the curve (the control point area)
      pushElement(state, {
        id: `${edge.id}-label`,
        type: 'text',
        x: cx - (edge.label.length * 4),
        y: cy - 12,
        text: edge.label,
        size: 13,
        color: edge.color,
      });
    }
    return;
  }

  // Straight edge
  const fromPt = nodeBoundaryPoint(fromNode, { x: toNode.x, y: toNode.y });
  const toPt = nodeBoundaryPoint(toNode, { x: fromNode.x, y: fromNode.y });

  pushElement(state, {
    id: edge.id,
    type: directed ? 'arrow' : 'line',
    from: fromPt,
    to: toPt,
    color: edge.color,
  });

  if (edge.label) {
    const mx = (fromPt.x + toPt.x) / 2;
    const my = (fromPt.y + toPt.y) / 2;
    const dx = toPt.x - fromPt.x;
    const dy = toPt.y - fromPt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    // Offset perpendicular to edge direction
    const perpX = len > 0 ? -dy / len : 0;
    const perpY = len > 0 ? dx / len : 0;
    const offset = 14;
    pushElement(state, {
      id: `${edge.id}-label`,
      type: 'text',
      x: mx + perpX * offset - edge.label.length * 4,
      y: my + perpY * offset - 7,
      text: edge.label,
      size: 13,
      color: edge.color,
    });
  }
}

export function buildGraphDiagramLayout(
  semanticBatch: SemanticBatch,
  state: BuildState,
): void {
  const nodeBlocks = semanticBatch.blocks.filter(
    (b): b is SemanticGraphNodeBlock => b.kind === 'node',
  );
  const edgeBlocks = semanticBatch.blocks.filter(
    (b): b is SemanticGraphEdgeBlock => b.kind === 'edge',
  );

  const resolved = resolveGraphNodes(nodeBlocks);
  const nodeMap = new Map<string, ResolvedNode>();
  for (const n of resolved) {
    nodeMap.set(n.id, n);
  }

  // Place nodes first, then edges on top
  for (const n of resolved) {
    placeGraphNode(n, state);
  }
  for (const e of edgeBlocks) {
    placeGraphEdge(e, nodeMap, state);
  }
}

export function planSemanticBatch(
  semanticBatch: SemanticBatch,
  context?: StructuredWhiteboardContext,
  trace?: PlannerTraceContext,
): PlannedSemanticLayout {
  const { repaired, warnings: validationWarnings } = trace
    ? trace.span('validate', 'validateSemanticBatchInput', () => validateSemanticBatchInput(semanticBatch))
    : validateSemanticBatchInput(semanticBatch);
  const regions = trace
    ? trace.span('region', 'buildDefaultRegions', () => buildDefaultRegions(context))
    : buildDefaultRegions(context);
  const state: BuildState = {
    elements: [],
    anchors: [],
    warnings: [...validationWarnings],
  };
  const normalizedSemantic = trace
    ? trace.span('template', 'compactSemanticBatchForLegibility', () => compactSemanticBatchForLegibility(repaired, state.warnings))
    : compactSemanticBatchForLegibility(repaired, state.warnings);

  // Single adaptive planner path: no hardcoded situation templates, only semantic content + region hints.
  if (trace) {
    trace.span('template', 'buildAdaptiveLayout', () => { buildAdaptiveLayout(normalizedSemantic, regions, state); return undefined; });
  } else {
    buildAdaptiveLayout(normalizedSemantic, regions, state);
  }

  return {
    batchId: normalizedSemantic.batch_id,
    stylePreset: choosePreset(normalizedSemantic.style_preset),
    templateUsed: normalizedSemantic.template,
    elements: state.elements,
    anchors: state.anchors,
    semanticBatch: normalizedSemantic,
    warnings: state.warnings,
  };
}

export function fromLegacyDrawBatchToSemanticStub(batchId: string, elements: DrawElement[]): SemanticBatch {
  return {
    batch_id: batchId,
    template: 'freeform_semantic',
    intent: 'summarize',
    blocks: [
      {
        id: `legacy-${batchId}`,
        kind: 'caption',
        text: `Imported legacy draw batch (${elements.length} elements)`,
        region_hint: 'bottom',
      },
    ],
  };
}
