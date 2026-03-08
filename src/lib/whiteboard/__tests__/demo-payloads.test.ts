import { describe, it, expect } from 'vitest';
import { demoPayloads, type LabeledDemo } from './demo-payloads';
import { DrawBatchSchema, normalizeDrawBatchPayload } from '@/lib/schema';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner/constraints';
import {
  applyDrawBatch,
  type WhiteboardApplyContext,
} from '@/lib/server/whiteboard/apply-draw-batch';
import { COORD_MIN, COORD_MAX } from '@/lib/whiteboard/coord-bounds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(seq?: number): WhiteboardApplyContext {
  return { sessionId: 'demo-test-session', sequenceNumber: seq };
}

/**
 * Types handled by `normalizeDrawBatchPayload` (has explicit if-branches).
 * Other schema-valid types (cartesian_axes, number_line, vector_arrow,
 * matrix_bracket) pass direct safeParse but get stripped during normalization.
 */
const NORMALIZER_SUPPORTED_TYPES = new Set([
  'clear', 'rect', 'ellipse', 'line', 'arrow', 'text', 'latex',
  'function_curve', 'angle_arc', 'integral_region',
]);

/** `function_curve` is handled by the normalizer but is NOT in the Zod schema union. */
const SCHEMA_EXCLUDED_TYPES = new Set(['function_curve']);

/** Check that all numeric coordinate-like fields are within bounds. */
function assertCoordsInBounds(elements: unknown[]): void {
  const coordKeys = new Set([
    'x', 'y', 'w', 'h', 'cx', 'cy', 'rx', 'ry',
    'width', 'height', 'dx', 'dy', 'radius', 'length',
    'cellWidth', 'cellHeight', 'size', 'fontSize',
  ]);

  for (const el of elements) {
    if (typeof el !== 'object' || el === null) continue;
    for (const [key, val] of Object.entries(el as Record<string, unknown>)) {
      if (coordKeys.has(key) && typeof val === 'number') {
        expect(val, `${(el as Record<string, unknown>).id}.${key}`).toBeGreaterThanOrEqual(COORD_MIN);
        expect(val, `${(el as Record<string, unknown>).id}.${key}`).toBeLessThanOrEqual(COORD_MAX);
        expect(Number.isFinite(val), `${(el as Record<string, unknown>).id}.${key} must be finite`).toBe(true);
      }
      if (key === 'from' || key === 'to') {
        const pt = val as { x?: number; y?: number } | null;
        if (pt && typeof pt === 'object') {
          if (typeof pt.x === 'number') {
            expect(pt.x).toBeGreaterThanOrEqual(COORD_MIN);
            expect(pt.x).toBeLessThanOrEqual(COORD_MAX);
          }
          if (typeof pt.y === 'number') {
            expect(pt.y).toBeGreaterThanOrEqual(COORD_MIN);
            expect(pt.y).toBeLessThanOrEqual(COORD_MAX);
          }
        }
      }
    }
  }
}

/**
 * Resolve the validated elements for a payload.
 *
 * The pipeline has two complementary paths:
 *  - Direct `DrawBatchSchema.safeParse()`: handles all schema-native types
 *    (rect, ellipse, line, arrow, text, latex, clear, cartesian_axes,
 *     number_line, vector_arrow, matrix_bracket, angle_arc, integral_region)
 *    but rejects `function_curve`.
 *  - `normalizeDrawBatchPayload()`: handles common LLM output variants and
 *    the `function_curve` passthrough, but doesn't handle cartesian_axes,
 *    number_line, vector_arrow, or matrix_bracket.
 *
 * This helper merges both paths to get the full element set:
 *  1. Schema-native elements via safeParse
 *  2. Normalizer-only elements (function_curve) via normalizeDrawBatchPayload
 */
function resolveElements(demo: LabeledDemo): {
  schemaElements: unknown[];
  normalizerOnlyElements: unknown[];
  allElements: unknown[];
  schemaParsed: boolean;
} {
  const rawTypes = demo.payload.elements.map((e) => e.type);
  const hasSchemaExcluded = rawTypes.some((t) => SCHEMA_EXCLUDED_TYPES.has(t));

  // Schema-native elements: filter out function_curve, then safeParse
  const schemaOnlyPayload = {
    ...demo.payload,
    elements: demo.payload.elements.filter((e) => !SCHEMA_EXCLUDED_TYPES.has(e.type)),
  };
  const parseResult = DrawBatchSchema.safeParse(schemaOnlyPayload);
  const schemaElements = parseResult.success ? (parseResult.data.elements as unknown[]) : [];

  // Normalizer-only elements: function_curve handled by normalizer
  let normalizerOnlyElements: unknown[] = [];
  if (hasSchemaExcluded) {
    const { normalized } = normalizeDrawBatchPayload(demo.payload);
    if (normalized) {
      normalizerOnlyElements = normalized.elements.filter(
        (e: Record<string, unknown>) => SCHEMA_EXCLUDED_TYPES.has(e.type as string),
      );
    }
  }

  return {
    schemaElements,
    normalizerOnlyElements,
    allElements: [...schemaElements, ...normalizerOnlyElements],
    schemaParsed: parseResult.success,
  };
}

// ---------------------------------------------------------------------------
// Task 2: Schema validation, normalization, and constraint tests
// ---------------------------------------------------------------------------

describe('Demo Payloads — schema validation & normalization', () => {
  it('should have 10 demo payloads', () => {
    expect(demoPayloads).toHaveLength(10);
  });

  describe.each(demoPayloads.map((d) => [d.label, d] as const))(
    '%s',
    (_label: string, demo: LabeledDemo) => {
      it('schema-native elements pass DrawBatchSchema.safeParse', () => {
        // Filter out function_curve (not in Zod union) then parse
        const schemaSafe = {
          ...demo.payload,
          elements: demo.payload.elements.filter(
            (e) => !SCHEMA_EXCLUDED_TYPES.has(e.type),
          ),
        };
        const result = DrawBatchSchema.safeParse(schemaSafe);
        if (!result.success) {
          // eslint-disable-next-line no-console
          console.error(`  [${demo.label}] schema errors:`, result.error.issues);
        }
        expect(result.success).toBe(true);
      });

      it('normalizer-handled elements normalize without null', () => {
        const { normalized, warnings } = normalizeDrawBatchPayload(demo.payload);
        expect(normalized).not.toBeNull();
        if (warnings.length > 0) {
          // Warnings for normalizer-unsupported types are expected
          const unexpected = warnings.filter(
            (w) => !w.startsWith('Unsupported element type'),
          );
          expect(
            unexpected,
            `unexpected normalization warnings: ${unexpected.join(', ')}`,
          ).toHaveLength(0);
        }
      });

      it('has valid coordinates within bounds', () => {
        const { allElements } = resolveElements(demo);
        assertCoordsInBounds(allElements);
      });

      it('survives enforceDrawBatchConstraints', () => {
        // Use schema-safe payload (no function_curve)
        const schemaSafe = {
          ...demo.payload,
          elements: demo.payload.elements.filter(
            (e) => !SCHEMA_EXCLUDED_TYPES.has(e.type),
          ),
        };
        const parsed = DrawBatchSchema.safeParse(schemaSafe);
        if (!parsed.success) return;
        const result = enforceDrawBatchConstraints(parsed.data);
        expect(result.batch).toBeDefined();
        expect(result.batch.elements.length).toBeGreaterThan(0);
      });

      it(`has the expected element count (${demo.expectedElementCount})`, () => {
        expect(demo.payload.elements.length).toBe(demo.expectedElementCount);
      });

      it('contains expected element types', () => {
        const types = new Set(demo.payload.elements.map((e) => e.type));
        for (const expected of demo.expectedTypes) {
          expect(types.has(expected), `missing type '${expected}'`).toBe(true);
        }
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Task 3: applyDrawBatch integration
// ---------------------------------------------------------------------------

describe('Demo Payloads — applyDrawBatch integration', () => {
  describe.each(demoPayloads.map((d, i) => [d.label, d, i] as const))(
    '%s',
    (_label: string, demo: LabeledDemo, idx: number) => {
      it('applyDrawBatch succeeds', () => {
        const result = applyDrawBatch(demo.payload, ctx(idx + 1));
        expect(result.success).toBe(true);
      });

      it('returns batch with elements', () => {
        const result = applyDrawBatch(demo.payload, ctx(idx + 1));
        expect(result.batch).toBeDefined();
        expect(result.batch.elements.length).toBeGreaterThan(0);
      });

      it('stamps sequenceNumber', () => {
        const result = applyDrawBatch(demo.payload, ctx(idx + 100));
        expect(typeof result.sequenceNumber).toBe('number');
        expect(result.sequenceNumber).toBeGreaterThan(0);
      });

      it('returns warnings array', () => {
        const result = applyDrawBatch(demo.payload, ctx(idx + 1));
        expect(Array.isArray(result.warnings)).toBe(true);
      });
    },
  );
});
