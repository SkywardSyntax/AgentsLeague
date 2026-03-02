import type { DrawBatch } from '@/types/agent';
import type { PlannedSemanticLayout } from './types';

export function lowerPlannedLayoutToDrawBatch(layout: PlannedSemanticLayout): DrawBatch {
  return {
    batch_id: layout.batchId,
    style_preset: layout.stylePreset,
    elements: layout.elements,
  };
}
