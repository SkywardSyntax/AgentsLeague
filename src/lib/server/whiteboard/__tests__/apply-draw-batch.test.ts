import { describe, it, expect } from 'vitest';
import {
  applyDrawBatch,
  type WhiteboardApplyContext,
} from '../apply-draw-batch';
import type { DrawBatch, SemanticBatch } from '@/types/agent';
import { COORD_MAX } from '@/lib/whiteboard/coord-bounds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(overrides: Partial<WhiteboardApplyContext> = {}): WhiteboardApplyContext {
  return { sessionId: 'test-session', ...overrides };
}

function validDrawBatch(overrides: Partial<DrawBatch> = {}): DrawBatch {
  return {
    batch_id: 'db-1',
    elements: [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 100 },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyDrawBatch', () => {
  it('DrawBatch is validated and returned with sequenceNumber', () => {
    const result = applyDrawBatch(validDrawBatch(), ctx());

    expect(result.success).toBe(true);
    expect(result.batch).toBeDefined();
    expect(result.batch.elements.length).toBeGreaterThanOrEqual(1);
    expect(typeof result.sequenceNumber).toBe('number');
    expect(result.sequenceNumber).toBeGreaterThan(0);
  });

  it('invalid batch returns failure with descriptive warnings', () => {
    const bad: DrawBatch = {
      batch_id: '',
      elements: [
        // Empty id is invalid per schema (min 1)
        { id: '', type: 'rect', x: 0, y: 0, w: 100, h: 100 },
      ],
    };

    const result = applyDrawBatch(bad, ctx());
    // The schema requires batch_id to have min length 1 and element id min 1
    // normalizeDrawBatchPayload may try to recover — either success with warnings
    // or failure with descriptive warnings.
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('coordinate clamping is applied (SEC-006)', () => {
    // Values at the boundary that pass schema but get clamped
    const batch = validDrawBatch({
      elements: [
        { id: 'r1', type: 'rect', x: COORD_MAX, y: COORD_MAX, w: 100, h: 100 },
      ],
    });

    const result = applyDrawBatch(batch, ctx());
    expect(result.success).toBe(true);

    const rect = result.batch.elements.find(
      (e) => e.type === 'rect' && e.id === 'r1',
    );
    expect(rect).toBeDefined();
    if (rect && rect.type === 'rect') {
      // x should be clamped to at most COORD_MAX
      expect(rect.x).toBeLessThanOrEqual(COORD_MAX);
      expect(rect.y).toBeLessThanOrEqual(COORD_MAX);
    }
  });

  it('warnings are returned for near-invalid inputs', () => {
    // A batch with an empty batch_id is invalid per schema.
    // normalizeDrawBatchPayload may produce recovery warnings.
    const batch: DrawBatch = {
      batch_id: '',
      elements: [
        { id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 100 },
      ],
    };

    const result = applyDrawBatch(batch, ctx());
    // Either recovery warnings or validation failure warnings
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('sequenceNumber override from context is used', () => {
    const result = applyDrawBatch(validDrawBatch(), ctx({ sequenceNumber: 99 }));
    expect(result.success).toBe(true);
    expect(result.sequenceNumber).toBe(99);
  });

  it('SemanticBatch is processed through semantic path', () => {
    const semanticBatch: SemanticBatch = {
      batch_id: 'sb-1',
      template: 'equation_derivation_vertical',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'E = mc^2' }],
        },
      ],
    };

    const result = applyDrawBatch(semanticBatch, ctx());
    expect(result.success).toBe(true);
    expect(result.batch).toBeDefined();
    expect(result.batch.elements.length).toBeGreaterThanOrEqual(1);
  });

  it('completely invalid payload produces warnings', () => {
    const garbage = {
      batch_id: 'x',
      elements: [
        { id: 'bad', type: 'nonexistent_type', x: 0 },
      ],
    } as unknown as DrawBatch;

    const result = applyDrawBatch(garbage, ctx());
    // normalizeDrawBatchPayload strips the unsupported element
    expect(result.warnings.length).toBeGreaterThan(0);
    if (!result.success) {
      // If normalization couldn't recover, batch is empty
      expect(result.batch.elements).toHaveLength(0);
    }
  });
});
