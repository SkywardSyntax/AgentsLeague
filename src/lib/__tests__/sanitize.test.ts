import { describe, it, expect } from 'vitest';
import { sanitizeScene, sanitizeSemanticScene } from '../client/sanitize';

describe('sanitizeScene', () => {
  it('passes valid rect elements', () => {
    const { valid, dropped } = sanitizeScene([
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 30, h: 40 },
    ]);
    expect(dropped).toBe(0);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ id: 'r1', type: 'rect', x: 10, y: 20 });
  });

  it('passes valid ellipse elements', () => {
    const { valid, dropped } = sanitizeScene([
      { id: 'e1', type: 'ellipse', cx: 100, cy: 200, rx: 50, ry: 30 },
    ]);
    expect(dropped).toBe(0);
    expect(valid[0]).toMatchObject({ type: 'ellipse' });
  });

  it('passes valid line and arrow elements', () => {
    const { valid, dropped } = sanitizeScene([
      { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 100 } },
      { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    ]);
    expect(dropped).toBe(0);
    expect(valid).toHaveLength(2);
  });

  it('passes valid text and latex elements', () => {
    const { valid, dropped } = sanitizeScene([
      { id: 't1', type: 'text', x: 10, y: 20, text: 'hello' },
      { id: 'x1', type: 'latex', x: 30, y: 40, tex: '\\frac{1}{2}' },
    ]);
    expect(dropped).toBe(0);
    expect(valid).toHaveLength(2);
  });

  it('passes valid clear elements', () => {
    const { valid, dropped } = sanitizeScene([{ id: 'c1', type: 'clear' }]);
    expect(dropped).toBe(0);
    expect(valid).toHaveLength(1);
  });

  it('drops invalid elements', () => {
    const { valid, dropped } = sanitizeScene([
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 30, h: 40 },
      { type: 'unknown', id: 'u1' },
      { id: 'bad', type: 'rect' }, // missing required fields
      'not-an-object',
      null,
    ]);
    expect(dropped).toBe(4);
    expect(valid).toHaveLength(1);
  });

  it('clamps out-of-range coordinates', () => {
    const { valid } = sanitizeScene([
      { id: 'r1', type: 'rect', x: 100000, y: -100000, w: 200000, h: 10 },
    ]);
    expect(valid[0]).toMatchObject({ x: 50000, y: -50000, w: 50000, h: 10 });
  });

  it('drops elements with NaN coordinates (Zod rejects NaN)', () => {
    const { valid, dropped } = sanitizeScene([
      { id: 'r1', type: 'rect', x: NaN, y: Infinity, w: 10, h: 10 },
    ]);
    expect(dropped).toBe(1);
    expect(valid).toHaveLength(0);
  });

  it('deduplicates by ID keeping last', () => {
    const { valid } = sanitizeScene([
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
      { id: 'r1', type: 'rect', x: 99, y: 99, w: 20, h: 20 },
    ]);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ x: 99, y: 99 });
  });

  it('handles empty input', () => {
    const { valid, dropped } = sanitizeScene([]);
    expect(valid).toHaveLength(0);
    expect(dropped).toBe(0);
  });
});

describe('sanitizeSemanticScene', () => {
  it('passes valid semantic batches', () => {
    const result = sanitizeSemanticScene([
      { batch_id: 'b1', template: 'freeform_semantic', blocks: [{ id: 'bl1', kind: 'caption', text: 'hi' }] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.batch_id).toBe('b1');
  });

  it('drops entries missing batch_id', () => {
    const result = sanitizeSemanticScene([
      { template: 'freeform_semantic', blocks: [] },
    ]);
    expect(result).toHaveLength(0);
  });

  it('drops entries missing blocks array', () => {
    const result = sanitizeSemanticScene([
      { batch_id: 'b1', template: 'freeform_semantic' },
    ]);
    expect(result).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(sanitizeSemanticScene([])).toHaveLength(0);
  });
});
