import type {
  DrawElement,
  SemanticBatch,
  StructuredWhiteboardContext,
  WhiteboardBounds,
  WhiteboardContext,
} from '@/types/agent';
import { buildStructuredWhiteboardContext } from './planner/context-v2';
import { boundsOf } from './bounds';

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
    const b = boundsOf(el);
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
