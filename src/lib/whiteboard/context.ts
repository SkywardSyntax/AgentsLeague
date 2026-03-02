import type {
  DrawElement,
  SemanticBatch,
  StructuredWhiteboardContext,
  WhiteboardBounds,
  WhiteboardContext,
} from '@/types/agent';
import { buildStructuredWhiteboardContext } from './planner/context-v2';

function elementBounds(el: DrawElement): WhiteboardBounds | null {
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
    const width = Math.max(size * 1.2, el.tex.length * size * 0.5);
    const height = size * (el.displayMode ? 2.1 : 1.5);
    return { minX: el.x, minY: el.y - size * 0.9, maxX: el.x + width, maxY: el.y + height };
  }
  return null;
}

function textPreview(el: DrawElement): string | undefined {
  if (el.type === 'text') return el.text.slice(0, 70);
  if (el.type === 'latex') return el.tex.slice(0, 70);
  return undefined;
}

export function buildWhiteboardContext(elements: DrawElement[]): WhiteboardContext {
  const counts: WhiteboardContext['elementTypeCounts'] = {};
  let bounds: WhiteboardBounds | undefined;

  elements.forEach((el) => {
    counts[el.type] = (counts[el.type] ?? 0) + 1;
    const b = elementBounds(el);
    if (!b) return;
    if (!bounds) {
      bounds = { ...b };
      return;
    }
    bounds = {
      minX: Math.min(bounds.minX, b.minX),
      minY: Math.min(bounds.minY, b.minY),
      maxX: Math.max(bounds.maxX, b.maxX),
      maxY: Math.max(bounds.maxY, b.maxY),
    };
  });

  const suggestedNextOrigin = {
    x: bounds ? Math.max(56, bounds.minX + 10) : 64,
    y: bounds ? bounds.maxY + 72 : 96,
  };

  return {
    elementCount: elements.length,
    bounds,
    elementTypeCounts: counts,
    recentElements: elements.slice(-10).map((el) => ({
      id: el.id,
      type: el.type,
      textPreview: textPreview(el),
    })),
    suggestedNextOrigin,
  };
}

export function buildWhiteboardContextV2(
  elements: DrawElement[],
  semanticScene: SemanticBatch[] = [],
): StructuredWhiteboardContext {
  return buildStructuredWhiteboardContext(elements, semanticScene);
}
