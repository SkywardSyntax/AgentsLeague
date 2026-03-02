import { describe, it, expect } from 'vitest';
import { DrawElementSchema, SemanticBatchSchema } from '../schema';

describe('DrawElementSchema validates every DrawElement union member', () => {
  it('valid RectElement passes schema', () => {
    const result = DrawElementSchema.safeParse({
      id: 'r1',
      type: 'rect',
      x: 0,
      y: 0,
      w: 100,
      h: 50,
    });
    expect(result.success).toBe(true);
  });

  it('valid EllipseElement passes schema', () => {
    const result = DrawElementSchema.safeParse({
      id: 'e1',
      type: 'ellipse',
      cx: 50,
      cy: 50,
      rx: 30,
      ry: 20,
    });
    expect(result.success).toBe(true);
  });

  it('valid LineElement passes schema', () => {
    const result = DrawElementSchema.safeParse({
      id: 'l1',
      type: 'line',
      from: { x: 0, y: 0 },
      to: { x: 10, y: 10 },
    });
    expect(result.success).toBe(true);
  });

  it('valid ArrowElement passes schema', () => {
    const result = DrawElementSchema.safeParse({
      id: 'a1',
      type: 'arrow',
      from: { x: 0, y: 0 },
      to: { x: 10, y: 10 },
    });
    expect(result.success).toBe(true);
  });

  it('valid TextElement passes schema', () => {
    const result = DrawElementSchema.safeParse({
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      text: 'hello',
    });
    expect(result.success).toBe(true);
  });

  it('valid LatexElement passes schema', () => {
    const result = DrawElementSchema.safeParse({
      id: 'x1',
      type: 'latex',
      x: 0,
      y: 0,
      tex: 'x^2',
      displayMode: true,
      fontSize: 24,
      align: 'center',
    });
    expect(result.success).toBe(true);
  });

  it('valid ClearElement passes schema', () => {
    const result = DrawElementSchema.safeParse({
      id: 'c1',
      type: 'clear',
    });
    expect(result.success).toBe(true);
  });

  it('unknown type polygon is rejected', () => {
    const result = DrawElementSchema.safeParse({
      id: 'p1',
      type: 'polygon',
      points: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('SemanticBatchSchema validates all 3 block kinds', () => {
  it('accepts batch with all three block kinds and rejects unknown kind', () => {
    const validBatch = {
      batch_id: 'sb1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'x^2' }],
        },
        {
          id: 'dp1',
          kind: 'diagram_panel',
          shapes: [
            {
              id: 's1',
              type: 'rect',
              label: 'box',
              relative_pose: { x: 0.5, y: 0.5 },
            },
          ],
          captions: [{ id: 'cap1', text: 'A caption', anchor: 'bottom' }],
        },
        {
          id: 'c1',
          kind: 'caption',
          text: 'Summary text',
        },
      ],
    };

    const validResult = SemanticBatchSchema.safeParse(validBatch);
    expect(validResult.success).toBe(true);

    const invalidBatch = {
      ...validBatch,
      blocks: [
        ...validBatch.blocks,
        { id: 'f1', kind: 'flowchart', nodes: [] },
      ],
    };
    const invalidResult = SemanticBatchSchema.safeParse(invalidBatch);
    expect(invalidResult.success).toBe(false);
  });
});
