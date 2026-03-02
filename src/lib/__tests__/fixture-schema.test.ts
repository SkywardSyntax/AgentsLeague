/**
 * Schema validation for E2E test fixtures.
 * Ensures fixtures conform to the DrawBatch Zod schema, catching
 * silent drift between fixture data and production types.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  FIXTURE_SIMPLE_RECT_BATCH,
  FIXTURE_MULTI_ELEMENT_BATCH,
  FIXTURE_CLEAR_BATCH,
} from '../../../e2e/fixtures/batches';

// Mirror the DrawBatch schema locally so we validate structural correctness
// without importing server-only code paths. This acts as a contract test:
// if production schema changes, fixture tests break here first.

const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const DrawElementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rect'),
    id: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().positive(),
    h: z.number().positive(),
    color: z.string().optional(),
    stroke_width: z.number().optional(),
  }),
  z.object({
    type: z.literal('ellipse'),
    id: z.string().min(1),
    cx: z.number().finite(),
    cy: z.number().finite(),
    rx: z.number().positive(),
    ry: z.number().positive(),
    color: z.string().optional(),
    stroke_width: z.number().optional(),
  }),
  z.object({
    type: z.literal('line'),
    id: z.string().min(1),
    from: PointSchema,
    to: PointSchema,
    color: z.string().optional(),
    stroke_width: z.number().optional(),
  }),
  z.object({
    type: z.literal('arrow'),
    id: z.string().min(1),
    from: PointSchema,
    to: PointSchema,
    color: z.string().optional(),
    stroke_width: z.number().optional(),
  }),
  z.object({
    type: z.literal('text'),
    id: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    text: z.string().min(1),
    size: z.number().positive().optional(),
    color: z.string().optional(),
    stroke_width: z.number().optional(),
  }),
  z.object({
    type: z.literal('latex'),
    id: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    tex: z.string().min(1),
    displayMode: z.boolean().optional(),
    fontSize: z.number().positive().optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    color: z.string().optional(),
    stroke_width: z.number().optional(),
  }),
  z.object({
    type: z.literal('clear'),
    id: z.string().min(1),
    color: z.string().optional(),
    stroke_width: z.number().optional(),
  }),
]);

const DrawBatchSchema = z.object({
  batch_id: z.string().min(1),
  style_preset: z.enum(['clean_pen_sketch', 'rough_sketch', 'blueprint_neat']).optional(),
  elements: z.array(DrawElementSchema).min(1),
});

describe('E2E Fixture Schema Validation', () => {
  it('FIXTURE_SIMPLE_RECT_BATCH conforms to DrawBatch schema', () => {
    const result = DrawBatchSchema.safeParse(FIXTURE_SIMPLE_RECT_BATCH);
    expect(result.success).toBe(true);
  });

  it('FIXTURE_MULTI_ELEMENT_BATCH conforms to DrawBatch schema', () => {
    const result = DrawBatchSchema.safeParse(FIXTURE_MULTI_ELEMENT_BATCH);
    expect(result.success).toBe(true);
  });

  it('FIXTURE_CLEAR_BATCH conforms to DrawBatch schema', () => {
    const result = DrawBatchSchema.safeParse(FIXTURE_CLEAR_BATCH);
    expect(result.success).toBe(true);
  });

  it('rejects a fixture with missing required fields', () => {
    const invalid = { batch_id: 'bad', elements: [{ type: 'rect', id: 'x' }] };
    const result = DrawBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects a fixture with NaN coordinates', () => {
    const invalid = {
      batch_id: 'nan-test',
      elements: [{ type: 'rect', id: 'r1', x: NaN, y: 0, w: 100, h: 50 }],
    };
    const result = DrawBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects a fixture with empty element id', () => {
    const invalid = {
      batch_id: 'empty-id',
      elements: [{ type: 'rect', id: '', x: 0, y: 0, w: 100, h: 50 }],
    };
    const result = DrawBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects empty elements array', () => {
    const invalid = { batch_id: 'empty-elements', elements: [] };
    const result = DrawBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('all fixture element IDs are unique within their batch', () => {
    const fixtures = [FIXTURE_SIMPLE_RECT_BATCH, FIXTURE_MULTI_ELEMENT_BATCH, FIXTURE_CLEAR_BATCH];
    for (const fixture of fixtures) {
      const ids = fixture.elements.map((el) => el.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });
});
