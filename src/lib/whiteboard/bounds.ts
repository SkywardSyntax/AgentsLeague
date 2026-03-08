import type { DrawElement, WhiteboardBounds } from '@/types/agent';
import { computeElementBounds } from './element-bounds';

/**
 * @deprecated Use `computeElementBounds` from `./element-bounds` directly.
 * Retained for backward compatibility; delegates to the canonical implementation
 * in detailed mode.
 */
export function boundsOf(el: DrawElement): WhiteboardBounds | null {
  return computeElementBounds(el, { mode: 'detailed' });
}
