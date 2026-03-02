import type { DrawBatch, WhiteboardBounds } from '@/types/agent';
import { computeElementBounds } from '@/lib/whiteboard/element-bounds';

export function boundsOfElementInBatch(el: DrawBatch['elements'][number]): WhiteboardBounds | null {
  return computeElementBounds(el, { mode: 'detailed' });
}

export function boundsOfBatch(batch: DrawBatch): WhiteboardBounds | null {
  let bounds: WhiteboardBounds | null = null;
  for (const el of batch.elements) {
    const b = boundsOfElementInBatch(el);
    if (!b) continue;
    if (!bounds) {
      bounds = { ...b };
      continue;
    }
    bounds = {
      minX: Math.min(bounds.minX, b.minX),
      minY: Math.min(bounds.minY, b.minY),
      maxX: Math.max(bounds.maxX, b.maxX),
      maxY: Math.max(bounds.maxY, b.maxY),
    };
  }
  return bounds;
}
