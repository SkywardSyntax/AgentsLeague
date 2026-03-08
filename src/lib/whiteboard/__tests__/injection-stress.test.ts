/**
 * Injection pipeline stress test.
 *
 * For every payload in the stress-test data file, verify:
 *  1. Schema validation (safeParse) — for schema-native types
 *  2. Normalization (normalizeDrawBatchPayload) — succeeds
 *  3. Constraint enforcement (enforceDrawBatchConstraints) — succeeds
 *  4. Full pipeline (applyDrawBatch) — succeeds
 *  5. No NaN coordinates in the result
 *  6. Element count > 0
 */

import { describe, it, expect } from 'vitest';
import { stressPayloads, type StressPayload } from './injection-stress-test';
import { DrawBatchSchema, normalizeDrawBatchPayload } from '@/lib/schema';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner/constraints';
import {
  applyDrawBatch,
  type WhiteboardApplyContext,
} from '@/lib/server/whiteboard/apply-draw-batch';
import type { DrawBatch, DrawElement } from '@/types/agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(seq?: number): WhiteboardApplyContext {
  return { sessionId: 'stress-test-session', sequenceNumber: seq };
}

/**
 * Types NOT in the Zod `DrawElementSchema` discriminated union.
 * These are handled by the normalizer and lowerer instead.
 */
const NON_SCHEMA_TYPES = new Set([
  'function_curve',
  'parametric_curve',
  'polar_plot',
  'riemann_sum',
  'tangent_line',
]);

/**
 * Recursively check all numeric properties for NaN / non-finite values.
 */
function assertNoNaN(elements: DrawElement[], batchLabel: string): void {
  for (const el of elements) {
    for (const [key, val] of Object.entries(el as unknown as Record<string, unknown>)) {
      if (typeof val === 'number') {
        expect(
          Number.isFinite(val),
          `[${batchLabel}] ${el.id}.${key} = ${val} is not finite`,
        ).toBe(true);
      }
      if (key === 'from' || key === 'to') {
        const pt = val as { x?: number; y?: number } | null;
        if (pt && typeof pt === 'object') {
          if (typeof pt.x === 'number') {
            expect(
              Number.isFinite(pt.x),
              `[${batchLabel}] ${el.id}.${key}.x = ${pt.x}`,
            ).toBe(true);
          }
          if (typeof pt.y === 'number') {
            expect(
              Number.isFinite(pt.y),
              `[${batchLabel}] ${el.id}.${key}.y = ${pt.y}`,
            ).toBe(true);
          }
        }
      }
    }
  }
}

/**
 * Filter a payload's elements to only schema-native types (in the Zod union).
 */
function schemaOnlyPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const elements = payload.elements as Array<{ type: string }>;
  return {
    ...payload,
    elements: elements.filter((e) => !NON_SCHEMA_TYPES.has(e.type)),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Injection pipeline stress test', () => {
  it(`exports ${stressPayloads.length} payloads (≥ 20)`, () => {
    expect(stressPayloads.length).toBeGreaterThanOrEqual(20);
  });

  describe.each(stressPayloads.map((sp, i) => [sp.label, sp, i] as const))(
    '%s',
    (_label: string, sp: StressPayload, idx: number) => {
      // ── 1. Schema validation ──────────────────────────────────────────
      it('schema-native elements pass DrawBatchSchema.safeParse', () => {
        const safe = schemaOnlyPayload(sp.payload);
        const elements = safe.elements as unknown[];
        if (elements.length === 0 && sp.hasNonSchemaTypes) {
          // All elements are non-schema types — skip schema check
          return;
        }
        const result = DrawBatchSchema.safeParse(safe);
        if (!result.success) {
          // eslint-disable-next-line no-console
          console.error(`[${sp.label}] schema errors:`, result.error.issues);
        }
        expect(result.success).toBe(true);
      });

      // ── 2. Normalization ──────────────────────────────────────────────
      it('normalizeDrawBatchPayload succeeds', () => {
        const { normalized, warnings } = normalizeDrawBatchPayload(sp.payload);
        expect(normalized).not.toBeNull();
        // Warnings for unsupported types in the normalizer are expected
        const unexpected = warnings.filter(
          (w) => !w.startsWith('Unsupported element type'),
        );
        expect(
          unexpected,
          `unexpected normalization warnings: ${unexpected.join(', ')}`,
        ).toHaveLength(0);
      });

      // ── 3. Constraint enforcement ─────────────────────────────────────
      it('enforceDrawBatchConstraints succeeds on schema-native elements', () => {
        const safe = schemaOnlyPayload(sp.payload);
        const parsed = DrawBatchSchema.safeParse(safe);
        if (!parsed.success) return; // non-schema-only payloads skip this
        const result = enforceDrawBatchConstraints(parsed.data);
        expect(result.batch).toBeDefined();
        expect(result.batch.elements.length).toBeGreaterThanOrEqual(0);
      });

      // ── 4. applyDrawBatch integration ─────────────────────────────────
      it('applyDrawBatch returns success', () => {
        const result = applyDrawBatch(
          sp.payload as unknown as DrawBatch,
          ctx(idx + 1),
        );
        expect(result.success).toBe(true);
      });

      // ── 5. No NaN coordinates ─────────────────────────────────────────
      it('result has no NaN coordinates', () => {
        const result = applyDrawBatch(
          sp.payload as unknown as DrawBatch,
          ctx(idx + 100),
        );
        if (result.batch.elements.length > 0) {
          assertNoNaN(result.batch.elements, sp.label);
        }
      });

      // ── 6. Element count > 0 ──────────────────────────────────────────
      it('result batch has elements', () => {
        const result = applyDrawBatch(
          sp.payload as unknown as DrawBatch,
          ctx(idx + 200),
        );
        expect(
          result.batch.elements.length,
          `[${sp.label}] expected elements > 0`,
        ).toBeGreaterThan(0);
      });
    },
  );
});
