import { describe, it, expect } from 'vitest';
import { DrawBatchSchema } from '@/lib/schema';
import {
  FIXTURE_SIMPLE_RECT_BATCH,
  FIXTURE_MULTI_ELEMENT_BATCH,
  FIXTURE_CLEAR_BATCH,
} from '../../../e2e/fixtures/batches';

describe('Fixture schema validation against DrawBatchSchema', () => {
  it('FIXTURE_SIMPLE_RECT_BATCH parses successfully', () => {
    const result = DrawBatchSchema.safeParse(FIXTURE_SIMPLE_RECT_BATCH);
    expect(result.success).toBe(true);
  });

  it('FIXTURE_MULTI_ELEMENT_BATCH parses successfully (style_preset is optional)', () => {
    const result = DrawBatchSchema.safeParse(FIXTURE_MULTI_ELEMENT_BATCH);
    expect(result.success).toBe(true);
    if (result.success) {
      // style_preset is optional with no default — should be undefined in output
      expect(result.data.style_preset).toBeUndefined();
    }
  });

  it('FIXTURE_CLEAR_BATCH parses successfully', () => {
    const result = DrawBatchSchema.safeParse(FIXTURE_CLEAR_BATCH);
    expect(result.success).toBe(true);
  });

  it('rejects fixture with missing batch_id (batch_id is required)', () => {
    const invalid = { elements: [{ id: 'x', type: 'clear' }] };
    const result = DrawBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects fixture with invalid element type', () => {
    const invalid = {
      batch_id: 'test-invalid-type',
      elements: [{ id: 'bad', type: 'nonexistent', x: 0, y: 0 }],
    };
    const result = DrawBatchSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});
