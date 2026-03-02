import { describe, expect, it } from 'vitest';
import { normalizeSemanticBatchPayload } from '@/lib/schema';

const validCaption = { id: 'c1', kind: 'caption', text: 'valid', region_hint: 'bottom' } as const;

describe('normalizeSemanticBatchPayload — negative tests', () => {
  it('rejects non-object payload', () => {
    const result = normalizeSemanticBatchPayload('string');
    expect(result.normalized).toBeNull();
    expect(result.warnings).toContain('Semantic batch payload is not an object');
  });

  it('warns on invalid style_preset and omits it', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [validCaption],
      style_preset: 'watercolor',
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid style_preset; using default')]),
    );
    expect(result.normalized).not.toBeNull();
    expect(result.normalized!.style_preset).toBeUndefined();
  });

  it('warns on invalid template and defaults to freeform_semantic', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'hexagonal_grid',
      blocks: [validCaption],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid template; defaulted to freeform_semantic')]),
    );
    expect(result.normalized!.template).toBe('freeform_semantic');
  });

  it('warns on invalid intent and drops it', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [validCaption],
      intent: 'destroy',
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid intent dropped')]),
    );
    expect(result.normalized).not.toBeNull();
    expect(result.normalized!.intent).toBeUndefined();
  });

  it('warns when a block is not an object', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [42],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Block 0 is not an object')]),
    );
    expect(result.normalized).toBeNull();
  });

  it('warns when equation stack has no valid lines and drops it', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [{ id: 'eq1', kind: 'equation_stack', lines: [] }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Equation stack eq1 dropped: no valid lines')]),
    );
  });

  it('warns when equation line is missing tex', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [{ id: 'eq1', kind: 'equation_stack', lines: [{ id: 'l1' }] }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Equation line eq1.0 missing tex')]),
    );
  });

  it('warns when equation line is not an object', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [{ id: 'eq1', kind: 'equation_stack', lines: [42] }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Equation line eq1.0 is not an object')]),
    );
  });

  it('warns when diagram panel shape has invalid type', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [{ id: 'dp1', kind: 'diagram_panel', shapes: [{ id: 's1', type: 'hexagon' }] }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Shape dp1.0 dropped: invalid type')]),
    );
  });

  it('warns when diagram panel shape is not an object', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [{ id: 'dp1', kind: 'diagram_panel', shapes: [null] }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Shape dp1.0 is not an object')]),
    );
  });

  it('warns when diagram panel axes are dropped', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [{ id: 'dp1', kind: 'diagram_panel', axes: { x_label: 42 } }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Panel dp1 axes dropped')]),
    );
  });

  it('warns when caption is missing text', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [{ id: 'c1', kind: 'caption' }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Caption c1 dropped: missing text')]),
    );
  });

  it('warns on unsupported block kind', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [{ id: 'u1', kind: 'timeline' }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Unsupported semantic block kind at 0')]),
    );
  });

  it('returns null normalized when all blocks are invalid', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        { id: 'u1', kind: 'timeline' },
        42,
        { id: 'c1', kind: 'caption' },
      ],
    });
    expect(result.normalized).toBeNull();
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('No valid semantic blocks in payload')]),
    );
  });

  it('warns when shape relative_pose is clamped to [0,1]', () => {
    const result = normalizeSemanticBatchPayload({
      batch_id: 'b1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'dp1',
          kind: 'diagram_panel',
          shapes: [{ id: 's1', type: 'rect', relative_pose: { x: 1.5, y: -0.3 } }],
        },
      ],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('clamped to [0,1]')]),
    );
    const shape = result.normalized!.blocks[0];
    expect(shape.kind).toBe('diagram_panel');
    if (shape.kind === 'diagram_panel') {
      expect(shape.shapes![0].relative_pose!.x).toBe(1);
      expect(shape.shapes![0].relative_pose!.y).toBe(0);
    }
  });
});
