import { describe, it, expect } from 'vitest';
import { normalizeDrawBatchPayload } from '../schema';

describe('normalizeDrawBatchPayload', () => {
  it('returns null for non-object payload', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload('not an object');
    expect(normalized).toBeNull();
    expect(warnings).toContain('Draw batch payload is not an object');
  });

  it('returns null for null payload', () => {
    const { normalized } = normalizeDrawBatchPayload(null);
    expect(normalized).toBeNull();
  });

  it('returns null for array payload', () => {
    const { normalized } = normalizeDrawBatchPayload([1, 2, 3]);
    expect(normalized).toBeNull();
  });

  it('normalizes a valid rect element', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 }],
    });
    expect(warnings).toHaveLength(0);
    expect(normalized).not.toBeNull();
    expect(normalized!.elements).toHaveLength(1);
    expect(normalized!.elements[0]).toEqual({
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 20,
      w: 100,
      h: 50,
    });
  });

  it('accepts width/height aliases for rect', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 200, height: 100 }],
    });
    expect(warnings).toHaveLength(0);
    expect(normalized!.elements[0]).toMatchObject({ w: 200, h: 100 });
  });

  it('warns and skips rect with missing coordinates', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'r1', type: 'rect', x: 10 }],
    });
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings).toContain('Rect r1 has invalid coordinates');
  });

  it('normalizes a valid ellipse element', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'e1', type: 'ellipse', cx: 100, cy: 100, rx: 50, ry: 30 }],
    });
    expect(warnings).toHaveLength(0);
    expect(normalized!.elements[0]).toEqual({
      id: 'e1',
      type: 'ellipse',
      cx: 100,
      cy: 100,
      rx: 50,
      ry: 30,
    });
  });

  it('accepts x/y and width/height aliases for ellipse', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'e1', type: 'ellipse', x: 100, y: 100, width: 80, height: 60 }],
    });
    expect(normalized!.elements[0]).toMatchObject({ cx: 100, cy: 100, rx: 40, ry: 30 });
  });

  it('warns and skips ellipse with missing coordinates', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'e1', type: 'ellipse', cx: 100 }],
    });
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings.some((w) => w.includes('Ellipse'))).toBe(true);
  });

  it('normalizes a valid line element', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }],
    });
    expect(warnings).toHaveLength(0);
    expect(normalized!.elements[0]).toEqual({
      id: 'l1',
      type: 'line',
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
    });
  });

  it('accepts x1/y1/x2/y2 aliases for line', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'l1', type: 'line', x1: 10, y1: 20, x2: 30, y2: 40 }],
    });
    expect(normalized!.elements[0]).toMatchObject({
      from: { x: 10, y: 20 },
      to: { x: 30, y: 40 },
    });
  });

  it('warns and skips line with missing endpoints', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'l1', type: 'line', from: { x: 0, y: 0 } }],
    });
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings.some((w) => w.includes('line'))).toBe(true);
  });

  it('normalizes a valid arrow element', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } }],
    });
    expect(warnings).toHaveLength(0);
    expect(normalized!.elements[0]).toMatchObject({ type: 'arrow' });
  });

  it('normalizes a valid text element', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 't1', type: 'text', x: 10, y: 20, text: 'Hello' }],
    });
    expect(warnings).toHaveLength(0);
    expect(normalized!.elements[0]).toEqual({
      id: 't1',
      type: 'text',
      x: 10,
      y: 20,
      text: 'Hello',
    });
  });

  it('accepts content alias for text element', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 't1', type: 'text', x: 0, y: 0, content: 'World' }],
    });
    expect(normalized!.elements[0]).toMatchObject({ text: 'World' });
  });

  it('warns and skips text with missing payload', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 't1', type: 'text', x: 10 }],
    });
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings.some((w) => w.includes('Text'))).toBe(true);
  });

  it('normalizes a valid latex element', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'x1', type: 'latex', x: 0, y: 0, tex: 'x^2' }],
    });
    expect(warnings).toHaveLength(0);
    expect(normalized!.elements[0]).toEqual({
      id: 'x1',
      type: 'latex',
      x: 0,
      y: 0,
      tex: 'x^2',
    });
  });

  it('accepts latex and text aliases for tex field', () => {
    const { normalized: n1 } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'x1', type: 'latex', x: 0, y: 0, latex: '\\frac{1}{2}' }],
    });
    expect(n1!.elements[0]).toMatchObject({ tex: '\\frac{1}{2}' });

    const { normalized: n2 } = normalizeDrawBatchPayload({
      batch_id: 'b2',
      elements: [{ id: 'x2', type: 'latex', x: 0, y: 0, text: 'y=mx+b' }],
    });
    expect(n2!.elements[0]).toMatchObject({ tex: 'y=mx+b' });
  });

  it('includes optional latex fields when present', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [
        {
          id: 'x1',
          type: 'latex',
          x: 0,
          y: 0,
          tex: 'e=mc^2',
          displayMode: true,
          fontSize: 24,
          align: 'center',
        },
      ],
    });
    expect(normalized!.elements[0]).toMatchObject({
      displayMode: true,
      fontSize: 24,
      align: 'center',
    });
  });

  it('warns and skips latex with missing tex', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'x1', type: 'latex', x: 0, y: 0 }],
    });
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings.some((w) => w.includes('LaTeX'))).toBe(true);
  });

  it('normalizes a clear element', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'c1', type: 'clear' }],
    });
    expect(warnings).toHaveLength(0);
    expect(normalized!.elements[0]).toEqual({ id: 'c1', type: 'clear' });
  });

  it('warns for unsupported element types', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'u1', type: 'polygon', points: [] }],
    });
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings).toContain('Unsupported element type at 0');
  });

  it('warns for non-object elements', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: ['not-an-object', null, 42],
    });
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings).toHaveLength(3);
  });

  it('generates default batch_id when missing', () => {
    const { normalized } = normalizeDrawBatchPayload({ elements: [] });
    expect(normalized!.batch_id).toMatch(/^batch-/);
  });

  it('generates default element ids when missing', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
    });
    expect(normalized!.elements[0]!.id).toBe('element-1');
  });

  it('preserves valid style_preset', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      style_preset: 'rough_sketch',
      elements: [],
    });
    expect(normalized!.style_preset).toBe('rough_sketch');
  });

  it('ignores invalid style_preset', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      style_preset: 'invalid_preset',
      elements: [],
    });
    expect(normalized!.style_preset).toBeUndefined();
  });

  it('preserves optional color and stroke_width', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [
        { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10, color: '#ff0000', stroke_width: 2 },
      ],
    });
    expect(normalized!.elements[0]).toMatchObject({ color: '#ff0000', stroke_width: 2 });
  });

  it('handles mixed valid and invalid elements', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [
        { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
        { id: 'bad', type: 'rect', x: 0 },
        { id: 't1', type: 'text', x: 0, y: 0, text: 'Hi' },
        null,
      ],
    });
    expect(normalized!.elements).toHaveLength(2);
    expect(warnings).toHaveLength(2);
  });

  it('handles empty elements array', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [],
    });
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('handles missing elements field', () => {
    const { normalized } = normalizeDrawBatchPayload({ batch_id: 'b1' });
    expect(normalized!.elements).toHaveLength(0);
  });

  it('coerces string numbers for coordinates', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'r1', type: 'rect', x: '10', y: '20', w: '100', h: '50' }],
    });
    expect(normalized!.elements[0]).toMatchObject({ x: 10, y: 20, w: 100, h: 50 });
  });
});
