import type { DrawBatch, DrawElement, WhiteboardBounds } from '@/types/agent';
import type { PlannerConfig, PlannerConstraintResult } from './types';
import { DEFAULT_PLANNER_CONFIG } from './types';
import { boundsOf } from './bounds';

export class BoundsCache {
  private cache = new Map<string, WhiteboardBounds | null>();

  get(el: DrawElement): WhiteboardBounds | null {
    const id = el.id;
    if (this.cache.has(id)) return this.cache.get(id)!;
    const b = boundsOf(el);
    this.cache.set(id, b);
    return b;
  }

  invalidate(id: string): void {
    this.cache.delete(id);
  }

  updateAfterShift(id: string, dx: number, dy: number): void {
    const b = this.cache.get(id);
    if (!b) {
      this.cache.delete(id);
      return;
    }
    this.cache.set(id, {
      minX: b.minX + dx,
      minY: b.minY + dy,
      maxX: b.maxX + dx,
      maxY: b.maxY + dy,
    });
  }
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

function isAreaShape(el: DrawElement): boolean {
  return el.type === 'rect' || el.type === 'ellipse';
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
    const elWidth = b.maxX - b.minX;
    const elHeight = b.maxY - b.minY;
    const availW = config.canvasWidth - 2 * config.margin;
    const availH = config.canvasHeight - 2 * config.margin;

    // When element is wider/taller than canvas, clamp to start margin only
    // to avoid contradictory corrections pushing both directions.
    if (elWidth >= availW) {
      dx = config.margin - b.minX;
    } else {
      if (b.minX < config.margin) dx += config.margin - b.minX;
      if (b.maxX > config.canvasWidth - config.margin) dx -= b.maxX - (config.canvasWidth - config.margin);
    }

    if (elHeight >= availH) {
      dy = config.margin - b.minY;
    } else {
      if (b.minY < config.margin) dy += config.margin - b.minY;
      if (b.maxY > config.canvasHeight - config.margin) dy -= b.maxY - (config.canvasHeight - config.margin);
    }

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

function resolveShapeSpacing(
  elements: DrawElement[],
  config: PlannerConfig,
  fixes: Set<string>,
  cache: BoundsCache,
): DrawElement[] {
  const shapeItems = elements
    .map((el, idx) => ({ el, idx, b: cache.get(el) }))
    .filter((entry): entry is { el: DrawElement; idx: number; b: WhiteboardBounds } =>
      Boolean(entry.b) && isAreaShape(entry.el),
    )
    .sort((a, b) => (a.b.minY === b.b.minY ? a.b.minX - b.b.minX : a.b.minY - b.b.minY));

  const next = [...elements];
  for (let i = 1; i < shapeItems.length; i++) {
    const current = shapeItems[i]!;
    let currentBounds = cache.get(next[current.idx]!);
    if (!currentBounds) continue;

    for (let j = 0; j < i; j++) {
      const prev = shapeItems[j]!;
      const prevBounds = cache.get(next[prev.idx]!);
      if (!prevBounds) continue;
      if (horizontalOverlap(currentBounds, prevBounds) < 12) continue;

      const verticalOverlap = Math.min(currentBounds.maxY, prevBounds.maxY) - Math.max(currentBounds.minY, prevBounds.minY);
      if (verticalOverlap <= 0) continue;

      const needed = prevBounds.maxY + config.minLabelGap - currentBounds.minY;
      if (needed > 0) {
        next[current.idx] = shiftElement(next[current.idx]!, 0, needed);
        cache.invalidate(current.el.id);
        currentBounds = cache.get(next[current.idx]!);
        if (!currentBounds) break;
        fixes.add('shape_spacing');
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

  // Also check text-shape overlaps to avoid false convergence
  const shapes = elements
    .map((el) => ({ el, b: boundsOf(el) }))
    .filter((entry): entry is { el: DrawElement; b: WhiteboardBounds } =>
      Boolean(entry.b) && isShapeLike(entry.el),
    );

  for (const text of items) {
    const id = (text.el as { id: string }).id.toLowerCase();
    if (!id.includes('label') && !id.includes('caption') && !id.includes('title')) continue;
    for (const shape of shapes) {
      if (horizontalOverlap(text.b, shape.b) < 12) continue;
      if (Math.min(text.b.maxY, shape.b.maxY) > Math.max(text.b.minY, shape.b.minY)) return true;
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

  // Group text elements into columns by horizontal midpoint to preserve
  // multi-column layouts instead of linearizing everything.
  const canvasMid = config.canvasWidth / 2;
  const leftCol = sortedText.filter((item) => {
    const midX = (item.b.minX + item.b.maxX) / 2;
    return midX < canvasMid * 0.75;
  });
  const rightCol = sortedText.filter((item) => {
    const midX = (item.b.minX + item.b.maxX) / 2;
    return midX >= canvasMid * 0.75;
  });

  // If all elements are in one column, fall back to single-column reflow.
  const columns = leftCol.length > 0 && rightCol.length > 0 ? [leftCol, rightCol] : [sortedText];

  const next = [...elements];
  for (const col of columns) {
    let y = col[0]!.b.minY;
    for (const item of col) {
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

export function enforceDrawBatchConstraints(
  batch: DrawBatch,
  partialConfig?: Partial<PlannerConfig>,
): PlannerConstraintResult {
  const config = { ...DEFAULT_PLANNER_CONFIG, ...partialConfig };
  const fixes = new Set<string>();
  const cache = new BoundsCache();

  let elements = [...batch.elements];
  let prevElementHash = '';
  for (let i = 0; i < config.maxRepairIterations; i++) {
    elements = enforceArrowLegibility(elements, fixes);
    elements = resolveTextSpacing(elements, config, fixes);
    elements = resolveLabelShapeSpacing(elements, config, fixes);
    elements = resolveShapeSpacing(elements, config, fixes, cache);
    elements = ensureCanvasBounds(elements, config, fixes);

    if (!hasTextOverlap(elements)) {
      return {
        batch: { ...batch, elements },
        violationsFixed: [...fixes],
        fallbackUsed: false,
      };
    }

    // Fixed-point detection: stop if element positions didn't change
    const curHash = elements.map((el) => el.id + JSON.stringify(cache.get(el))).join('|');
    if (curHash === prevElementHash) break;
    prevElementHash = curHash;
  }

  elements = fallbackVerticalReflow(elements, config, fixes);
  elements = ensureCanvasBounds(elements, config, fixes);

  return {
    batch: { ...batch, elements },
    violationsFixed: [...fixes],
    fallbackUsed: true,
  };
}
