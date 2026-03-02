import type { DrawBatch, DrawElement, WhiteboardBounds } from '@/types/agent';
import type { PlannerConfig, PlannerConstraintResult } from './types';
import { DEFAULT_PLANNER_CONFIG } from './types';

function boundsOf(el: DrawElement): WhiteboardBounds | null {
  if (el.type === 'rect') {
    return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
  }
  if (el.type === 'ellipse') {
    return { minX: el.cx - el.rx, minY: el.cy - el.ry, maxX: el.cx + el.rx, maxY: el.cy + el.ry };
  }
  if (el.type === 'line' || el.type === 'arrow') {
    return {
      minX: Math.min(el.from.x, el.to.x),
      minY: Math.min(el.from.y, el.to.y),
      maxX: Math.max(el.from.x, el.to.x),
      maxY: Math.max(el.from.y, el.to.y),
    };
  }
  if (el.type === 'text') {
    const size = el.size ?? 18;
    const width = Math.max(size * 0.45, el.text.length * size * 0.52);
    return { minX: el.x, minY: el.y - size * 0.9, maxX: el.x + width, maxY: el.y + size * 0.5 };
  }
  if (el.type === 'latex') {
    const size = el.fontSize ?? 20;
    const fracCount = (el.tex.match(/\\(?:d?frac|tfrac)\b/g) ?? []).length;
    const rootCount = (el.tex.match(/\\sqrt\b/g) ?? []).length;
    const sumLikeCount = (el.tex.match(/\\(?:sum|prod|int|lim)\b/g) ?? []).length;
    const matrixLikeCount = (el.tex.match(/\\(?:begin\{[^}]*matrix\}|begin\{array\}|cases|aligned|align)\b/g) ?? [])
      .length;
    const scriptCount = (el.tex.match(/[\^_]/g) ?? []).length;
    const lineBreakCount = (el.tex.match(/\\\\/g) ?? []).length;

    const widthScale = 0.44 + Math.min(0.16, fracCount * 0.02 + matrixLikeCount * 0.04);
    const rawWidth = Math.max(size * 1.8, el.tex.length * size * widthScale);
    const width = Math.min(1460, rawWidth);

    const complexity =
      1 +
      fracCount * 0.55 +
      rootCount * 0.2 +
      sumLikeCount * 0.25 +
      matrixLikeCount * 1.2 +
      Math.min(1.2, scriptCount * 0.04) +
      lineBreakCount * 0.6;
    const baseHeight = size * (el.displayMode ? 1.95 : 1.45);
    const height = Math.max(size * (el.displayMode ? 2.15 : 1.5), baseHeight * complexity);

    let minX = el.x;
    if (el.align === 'center') minX = el.x - width / 2;
    if (el.align === 'right') minX = el.x - width;

    return { minX, minY: el.y - size * 1.02, maxX: minX + width, maxY: el.y + height };
  }
  return null;
}

function shiftElement(el: DrawElement, dx: number, dy: number): DrawElement {
  if (el.type === 'rect') return { ...el, x: el.x + dx, y: el.y + dy };
  if (el.type === 'ellipse') return { ...el, cx: el.cx + dx, cy: el.cy + dy };
  if (el.type === 'line' || el.type === 'arrow') {
    return {
      ...el,
      from: { x: el.from.x + dx, y: el.from.y + dy },
      to: { x: el.to.x + dx, y: el.to.y + dy },
    };
  }
  if (el.type === 'text') return { ...el, x: el.x + dx, y: el.y + dy };
  if (el.type === 'latex') return { ...el, x: el.x + dx, y: el.y + dy };
  return el;
}

function horizontalOverlap(a: WhiteboardBounds, b: WhiteboardBounds): number {
  return Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
}

function isTextLike(el: DrawElement): boolean {
  return el.type === 'text' || el.type === 'latex';
}

function isShapeLike(el: DrawElement): boolean {
  return el.type === 'rect' || el.type === 'ellipse' || el.type === 'line' || el.type === 'arrow';
}

function ensureCanvasBounds(
  elements: DrawElement[],
  config: PlannerConfig,
  fixes: Set<string>,
): DrawElement[] {
  return elements.map((el) => {
    const b = boundsOf(el);
    if (!b) return el;

    let dx = 0;
    let dy = 0;

    if (b.minX < config.margin) dx += config.margin - b.minX;
    if (b.minY < config.margin) dy += config.margin - b.minY;
    if (b.maxX > config.canvasWidth - config.margin) dx -= b.maxX - (config.canvasWidth - config.margin);
    if (b.maxY > config.canvasHeight - config.margin) dy -= b.maxY - (config.canvasHeight - config.margin);

    if (dx !== 0) fixes.add('shift_x');
    if (dy !== 0) fixes.add('shift_y');

    return dx !== 0 || dy !== 0 ? shiftElement(el, dx, dy) : el;
  });
}

function resolveTextSpacing(
  elements: DrawElement[],
  config: PlannerConfig,
  fixes: Set<string>,
): DrawElement[] {
  const textItems = elements
    .map((el, idx) => ({ el, idx, b: boundsOf(el) }))
    .filter((entry): entry is { el: DrawElement; idx: number; b: WhiteboardBounds } =>
      Boolean(entry.b) && isTextLike(entry.el),
    )
    .sort((a, b) => (a.b.minY === b.b.minY ? a.b.minX - b.b.minX : a.b.minY - b.b.minY));

  const next = [...elements];
  for (let i = 1; i < textItems.length; i++) {
    const current = textItems[i]!;
    let currentBounds = boundsOf(next[current.idx]);
    if (!currentBounds) continue;

    for (let j = 0; j < i; j++) {
      const prev = textItems[j]!;
      const prevBounds = boundsOf(next[prev.idx]);
      if (!prevBounds) continue;
      if (horizontalOverlap(currentBounds, prevBounds) < 10) continue;

      const needed = prevBounds.maxY + config.minTextGap - currentBounds.minY;
      if (needed > 0) {
        next[current.idx] = shiftElement(next[current.idx]!, 0, needed);
        currentBounds = boundsOf(next[current.idx]);
        if (!currentBounds) break;
        fixes.add('shift_y');
      }
    }
  }

  return next;
}

function resolveLabelShapeSpacing(
  elements: DrawElement[],
  config: PlannerConfig,
  fixes: Set<string>,
): DrawElement[] {
  const shapes = elements
    .map((el, idx) => ({ el, idx, b: boundsOf(el) }))
    .filter((entry): entry is { el: DrawElement; idx: number; b: WhiteboardBounds } =>
      Boolean(entry.b) && isShapeLike(entry.el),
    );

  const next = [...elements];

  for (let i = 0; i < next.length; i++) {
    const el = next[i]!;
    if (!isTextLike(el)) continue;
    const id = (el as { id: string }).id.toLowerCase();
    if (!id.includes('label') && !id.includes('caption') && !id.includes('title')) continue;

    let b = boundsOf(el);
    if (!b) continue;

    for (const shape of shapes) {
      if (horizontalOverlap(b, shape.b) < 12) continue;
      const needed = shape.b.maxY + config.minLabelGap - b.minY;
      if (needed > 0) {
        next[i] = shiftElement(next[i]!, 0, needed);
        b = boundsOf(next[i]);
        if (!b) break;
        fixes.add('shift_y');
      }
    }
  }

  return next;
}

function hasTextOverlap(elements: DrawElement[]): boolean {
  const items = elements
    .map((el) => ({ el, b: boundsOf(el) }))
    .filter((entry): entry is { el: DrawElement; b: WhiteboardBounds } =>
      Boolean(entry.b) && isTextLike(entry.el),
    );

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!.b;
      const b = items[j]!.b;
      const xOverlap = horizontalOverlap(a, b);
      if (xOverlap < 12) continue;
      if (Math.min(a.maxY, b.maxY) > Math.max(a.minY, b.minY)) return true;
    }
  }

  return false;
}

function fallbackVerticalReflow(
  elements: DrawElement[],
  config: PlannerConfig,
  fixes: Set<string>,
): DrawElement[] {
  const sortedText = elements
    .map((el, idx) => ({ el, idx, b: boundsOf(el) }))
    .filter((entry): entry is { el: DrawElement; idx: number; b: WhiteboardBounds } =>
      Boolean(entry.b) && isTextLike(entry.el),
    )
    .sort((a, b) => (a.b.minY === b.b.minY ? a.b.minX - b.b.minX : a.b.minY - b.b.minY));

  if (sortedText.length === 0) return elements;

  let y = sortedText[0]!.b.minY;
  const next = [...elements];
  for (const item of sortedText) {
    const current = next[item.idx]!;
    const b = boundsOf(current);
    if (!b) continue;
    const dy = y - b.minY;
    if (Math.abs(dy) > 0.5) {
      next[item.idx] = shiftElement(current, 0, dy);
      fixes.add('region_reflow');
    }
    const nextBounds = boundsOf(next[item.idx]!);
    if (!nextBounds) continue;
    y = nextBounds.maxY + config.minTextGap;
  }

  return next;
}

function enforceArrowLegibility(
  elements: DrawElement[],
  fixes: Set<string>,
): DrawElement[] {
  return elements.map((el) => {
    if (el.type !== 'arrow') return el;
    const dx = el.to.x - el.from.x;
    const dy = el.to.y - el.from.y;
    const len = Math.hypot(dx, dy);
    if (len >= 22) return el;

    const ux = len > 0 ? dx / len : 1;
    const uy = len > 0 ? dy / len : 0;
    fixes.add('arrow_endpoint_adjust');
    return {
      ...el,
      to: {
        x: el.from.x + ux * 28,
        y: el.from.y + uy * 28,
      },
    };
  });
}

/**
 * Applies layout constraints to a draw batch: canvas bounds, text spacing,
 * label-shape spacing, and arrow legibility. Falls back to vertical reflow
 * if overlaps persist after {@link PlannerConfig.maxRepairIterations} passes.
 */
export function enforceDrawBatchConstraints(
  batch: DrawBatch,
  partialConfig?: Partial<PlannerConfig>,
): PlannerConstraintResult {
  const config = { ...DEFAULT_PLANNER_CONFIG, ...partialConfig };
  const fixes = new Set<string>();

  let elements = [...batch.elements];
  for (let i = 0; i < config.maxRepairIterations; i++) {
    elements = enforceArrowLegibility(elements, fixes);
    elements = resolveTextSpacing(elements, config, fixes);
    elements = resolveLabelShapeSpacing(elements, config, fixes);
    elements = ensureCanvasBounds(elements, config, fixes);

    if (!hasTextOverlap(elements)) {
      return {
        batch: { ...batch, elements },
        violationsFixed: [...fixes],
        fallbackUsed: false,
      };
    }
  }

  elements = fallbackVerticalReflow(elements, config, fixes);
  elements = ensureCanvasBounds(elements, config, fixes);

  return {
    batch: { ...batch, elements },
    violationsFixed: [...fixes],
    fallbackUsed: true,
  };
}
