import type { DrawBatch, SemanticBatch } from '@/types/agent';
import {
  DrawBatchSchema,
  SemanticBatchSchema,
  normalizeDrawBatchPayload,
  normalizeSemanticBatchPayload,
} from '@/lib/schema';
import {
  enforceDrawBatchConstraints,
  fromLegacyDrawBatchToSemanticStub,
  lowerPlannedLayoutToDrawBatch,
  planSemanticBatch,
} from '@/lib/whiteboard/planner';
import { clampBatchCoordinates } from '@/lib/whiteboard/clamp-coordinates';
import { migrateBatch } from '@/lib/whiteboard/schema-migration';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WhiteboardApplyContext {
  sessionId: string;
  sequenceNumber?: number;
  /** Optional current batches for context-aware placement when applying from the inject API. */
  currentBatches?: DrawBatch[];
}

export interface ApplyResult {
  success: boolean;
  batch: DrawBatch;
  sequenceNumber: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let globalSequence = 0;

function nextSequence(override?: number): number {
  if (override !== undefined) return override;
  return ++globalSequence;
}

function applySemanticPath(
  semanticPayload: SemanticBatch,
  warnings: string[],
): DrawBatch {
  const planned = planSemanticBatch(semanticPayload);
  let drawBatch = lowerPlannedLayoutToDrawBatch(planned);
  // SEC-006: clamp coordinates before constraint enforcement
  drawBatch = { ...drawBatch, elements: clampBatchCoordinates(drawBatch.elements) };
  const constrained = enforceDrawBatchConstraints(drawBatch);
  drawBatch = constrained.batch;

  warnings.push(...planned.warnings);
  if (constrained.violationsFixed.length > 0) {
    warnings.push(`layout_repaired: ${constrained.violationsFixed.join(', ')}`);
  }
  if (constrained.fallbackUsed) {
    warnings.push('layout_fallback_used');
  }
  return drawBatch;
}

function applyDrawPath(
  drawPayload: DrawBatch,
  warnings: string[],
): DrawBatch {
  // SEC-006: clamp coordinates before constraint enforcement
  const clamped = { ...drawPayload, elements: clampBatchCoordinates(drawPayload.elements) };
  const constrained = enforceDrawBatchConstraints(clamped);
  if (constrained.violationsFixed.length > 0) {
    warnings.push(`layout_repaired: ${constrained.violationsFixed.join(', ')}`);
  }
  if (constrained.fallbackUsed) {
    warnings.push('layout_fallback_used');
  }
  return constrained.batch;
}

// ---------------------------------------------------------------------------
// Main entry point — transport-agnostic
// ---------------------------------------------------------------------------

/**
 * Validates and applies a whiteboard draw batch or semantic batch.
 *
 * This is the transport-agnostic core extracted per ARCH-001.
 * It performs validation, constraint enforcement, and returns a pure result
 * without touching SSE, streams, or HTTP concerns.
 */
export function applyDrawBatch(
  rawBatch: DrawBatch | SemanticBatch,
  context: WhiteboardApplyContext,
): ApplyResult {
  const warnings: string[] = [];
  let batch: DrawBatch | SemanticBatch = rawBatch;

  // Run schema migration on raw DrawBatch payloads to strip unknown element
  // types and back-fill schemaVersion before validation (J9 / TYPE-001).
  const isSemanticBatch = 'template' in batch && 'blocks' in batch;
  if (!isSemanticBatch) {
    try {
      const migrated = migrateBatch(batch);
      warnings.push(...migrated.warnings);
      batch = migrated.batch;
    } catch {
      // Migration failure is non-fatal — fall through to normal validation
    }
  }

  let resultBatch: DrawBatch;

  if (isSemanticBatch) {
    // Validate as SemanticBatch
    const validation = SemanticBatchSchema.safeParse(batch);
    if (!validation.success) {
      const normalized = normalizeSemanticBatchPayload(batch);
      if (normalized.normalized) {
        warnings.push(...normalized.warnings);
        const revalidation = SemanticBatchSchema.safeParse(normalized.normalized);
        if (revalidation.success) {
          resultBatch = applySemanticPath(revalidation.data, warnings);
        } else {
          return {
            success: false,
            batch: { batch_id: batch.batch_id ?? 'unknown', elements: [] },
            sequenceNumber: nextSequence(context.sequenceNumber),
            warnings: [
              ...normalized.warnings,
              ...revalidation.error.issues.map((i) => i.message),
            ],
          };
        }
      } else {
        return {
          success: false,
          batch: { batch_id: batch.batch_id ?? 'unknown', elements: [] },
          sequenceNumber: nextSequence(context.sequenceNumber),
          warnings: [
            ...normalized.warnings,
            ...validation.error.issues.map((i) => i.message),
          ],
        };
      }
    } else {
      resultBatch = applySemanticPath(validation.data, warnings);
    }
  } else {
    // Validate as DrawBatch
    const validation = DrawBatchSchema.safeParse(batch);
    if (!validation.success) {
      const normalized = normalizeDrawBatchPayload(batch);
      if (normalized.normalized && normalized.normalized.elements.length > 0) {
        warnings.push(...normalized.warnings);
        resultBatch = applyDrawPath(normalized.normalized as DrawBatch, warnings);
      } else {
        return {
          success: false,
          batch: { batch_id: (batch as DrawBatch).batch_id ?? 'unknown', elements: [] },
          sequenceNumber: nextSequence(context.sequenceNumber),
          warnings: [
            ...normalized.warnings,
            ...validation.error.issues.map((i) => i.message),
          ],
        };
      }
    } else {
      resultBatch = applyDrawPath(validation.data, warnings);
    }
  }

  return {
    success: true,
    batch: resultBatch,
    sequenceNumber: nextSequence(context.sequenceNumber),
    warnings,
  };
}
