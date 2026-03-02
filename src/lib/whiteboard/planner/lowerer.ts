import type { DrawBatch, DrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from './types';

export const DEFAULT_MAX_LOWERED_ELEMENTS = 60;

function drawOrderPriority(el: DrawElement): number {
  if (el.type === 'rect' || el.type === 'ellipse') return 0;
  if (el.type === 'line' || el.type === 'arrow') return 1;
  if (el.type === 'text' || el.type === 'latex') return 2;
  return 3;
}

export interface LowerOptions {
  maxElements?: number;
}

export function lowerPlannedLayoutToDrawBatch(
  layout: PlannedSemanticLayout,
  options?: LowerOptions,
): DrawBatch {
  const maxElements = options?.maxElements ?? DEFAULT_MAX_LOWERED_ELEMENTS;

  // Deduplicate elements by id (keep last occurrence)
  const seen = new Map<string, DrawElement>();
  for (const el of layout.elements) {
    seen.set(el.id, el);
  }
  let deduped = [...seen.values()];

  if (deduped.length === 0) {
    layout.warnings.push('empty_layout');
  }

  if (deduped.length > maxElements) {
    deduped = deduped.slice(0, maxElements);
    layout.warnings.push('element_count_capped');
  }

  // Sort for optimal draw order: shapes → lines/arrows → text/latex
  const sorted = deduped.sort((a, b) => drawOrderPriority(a) - drawOrderPriority(b));

  return {
    batch_id: layout.batchId,
    style_preset: layout.stylePreset,
    elements: sorted,
  };
}
