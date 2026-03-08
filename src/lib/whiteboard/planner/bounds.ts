import type { DrawElement, WhiteboardBounds } from '@/types/agent';
import { computeElementBounds } from '../element-bounds';

/**
 * @deprecated Use `computeElementBounds` from `../element-bounds` directly.
 * Retained as a re-export shim (MIGRATE_FIRST) — do not add new logic here.
 * Delegates to the canonical implementation in detailed mode which includes
 * NaN/Infinity validation, 0.52 char-width multiplier, baseline offset,
 * multiline support, and LaTeX regex heuristics.
 */
export function boundsOf(el: DrawElement): WhiteboardBounds | null {
  return computeElementBounds(el, { mode: 'detailed' });
}
