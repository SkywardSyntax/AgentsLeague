import type { DrawBatch, DrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from './types';

function drawOrderPriority(el: DrawElement): number {
  if (el.type === 'rect' || el.type === 'ellipse') return 0;
  if (el.type === 'line' || el.type === 'arrow') return 1;
  if (el.type === 'text' || el.type === 'latex') return 2;
  return 3;
}

export function lowerPlannedLayoutToDrawBatch(layout: PlannedSemanticLayout): DrawBatch {
  // Deduplicate elements by id (keep last occurrence)
  const seen = new Map<string, DrawElement>();
  for (const el of layout.elements) {
    seen.set(el.id, el);
  }
  const deduped = [...seen.values()];

  // Sort for optimal draw order: shapes → lines/arrows → text/latex
  const sorted = deduped.sort((a, b) => drawOrderPriority(a) - drawOrderPriority(b));

  return {
    batch_id: layout.batchId,
    style_preset: layout.stylePreset,
    elements: sorted,
  };
}
