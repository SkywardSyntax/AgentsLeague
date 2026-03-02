import { describe, expect, it } from 'vitest';
import { normalizeSemanticBatchPayload, SemanticBatchSchema } from '@/lib/schema';

describe('normalizeSemanticBatchPayload', () => {
  it('repairs out-of-range relative_pose values to pass semantic schema', () => {
    const raw = {
      batch_id: 'sem-norm-1',
      template: 'jacobian_mapping_2panel',
      blocks: [
        {
          id: 'panel-1',
          kind: 'diagram_panel',
          shapes: [
            {
              id: 'shape-1',
              type: 'parallelogram',
              relative_pose: {
                x: -0.4,
                y: 1.8,
                w: -0.2,
                h: 2.2,
              },
            },
          ],
        },
      ],
    };

    const normalized = normalizeSemanticBatchPayload(raw);
    expect(normalized.normalized).not.toBeNull();
    expect(normalized.warnings.some((w) => w.includes('clamped'))).toBe(true);

    const parsed = SemanticBatchSchema.safeParse(normalized.normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const block = parsed.data.blocks[0];
    expect(block.kind).toBe('diagram_panel');
    if (block.kind !== 'diagram_panel') return;

    const pose = block.shapes?.[0]?.relative_pose;
    expect(pose).toBeDefined();
    expect(pose?.x).toBeGreaterThanOrEqual(0);
    expect(pose?.x).toBeLessThanOrEqual(1);
    expect(pose?.y).toBeGreaterThanOrEqual(0);
    expect(pose?.y).toBeLessThanOrEqual(1);
  });
});
