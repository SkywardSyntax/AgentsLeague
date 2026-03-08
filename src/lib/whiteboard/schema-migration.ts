import { DrawBatchSchema, DRAW_ELEMENT_TYPES } from '@/lib/schema';
import type { DrawBatch } from '@/types/agent';

const CURRENT_SCHEMA_VERSION = 1;

/**
 * All element types recognised by the pipeline.  Includes both schema-native
 * types (in the Zod discriminated union) and types handled exclusively by the
 * normaliser / lowerer (function_curve, parametric_curve, polar_plot,
 * riemann_sum, tangent_line).  Elements whose type is NOT in this set are
 * stripped during migration — so it must stay in sync with the canonical list
 * exported from `schema.ts` plus any normaliser-only types.
 */
const KNOWN_ELEMENT_TYPES = new Set<string>([
  ...DRAW_ELEMENT_TYPES,
  // Normaliser-only types (not in the Zod union but valid in the pipeline)
  'riemann_sum',
  'tangent_line',
]);

/**
 * Migrate an unknown batch payload to the current DrawBatch schema.
 *
 * - Strips elements with unrecognized `type` values (logs a warning)
 * - Backfills `schemaVersion` when absent
 * - Validates the final payload through the Zod schema
 *
 * This is the single entry-point for defensive deserialization (J9 / TYPE-001).
 */
export function migrateBatch(raw: unknown): { batch: DrawBatch; warnings: string[] } {
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    throw new Error('migrateBatch: input is not an object');
  }

  const obj = raw as Record<string, unknown>;

  // --- version negotiation ---
  const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0;

  if (version > CURRENT_SCHEMA_VERSION) {
    warnings.push(
      `schema_version_future: batch declares v${version}, current is v${CURRENT_SCHEMA_VERSION}; ` +
        'unknown element types will be stripped',
    );
  }

  // --- strip unknown element types ---
  if (Array.isArray(obj.elements)) {
    const cleaned: unknown[] = [];
    for (const el of obj.elements) {
      if (el && typeof el === 'object' && 'type' in el) {
        const elType = (el as Record<string, unknown>).type;
        if (typeof elType === 'string' && !KNOWN_ELEMENT_TYPES.has(elType)) {
          warnings.push(`unknown_element_type_stripped: "${elType}"`);
          continue;
        }
      }
      cleaned.push(el);
    }
    obj.elements = cleaned;
  }

  // --- ensure schemaVersion ---
  if (obj.schemaVersion == null) {
    obj.schemaVersion = CURRENT_SCHEMA_VERSION;
  }

  // --- validate through Zod ---
  const result = DrawBatchSchema.safeParse(obj);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`migrateBatch: validation failed — ${issues.join('; ')}`);
  }

  return { batch: result.data as DrawBatch, warnings };
}
