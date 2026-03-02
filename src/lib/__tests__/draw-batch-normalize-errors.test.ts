import { describe, it, expect } from 'vitest';
import { normalizeDrawBatchPayload } from '../schema';

describe('normalizeDrawBatchPayload – rejection branches', () => {
  it('rejects non-object payload', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload('not an object');
    expect(normalized).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not an object/i);
  });

  it('rejects element that is not an object', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [42],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Element 0 is not an object/);
    expect(normalized!.elements).toHaveLength(0);
  });

  it('rejects rect with invalid coordinates', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'r1', type: 'rect', x: 'NaN', y: 10, w: 20, h: 30 }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Rect r1 has invalid coordinates/);
    expect(normalized!.elements).toHaveLength(0);
  });

  it('rejects ellipse with missing radii', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'e1', type: 'ellipse', cx: 0, cy: 0 }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Ellipse e1 has invalid coordinates/);
    expect(normalized!.elements).toHaveLength(0);
  });

  it('rejects arrow with missing endpoints', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'a1', type: 'arrow' }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/arrow a1 has invalid endpoints/);
    expect(normalized!.elements).toHaveLength(0);
  });

  it('rejects text with missing text content', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 't1', type: 'text', x: 0, y: 0 }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Text t1 has invalid payload/);
    expect(normalized!.elements).toHaveLength(0);
  });

  it('rejects latex with missing tex string', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'l1', type: 'latex', x: 0, y: 0 }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/LaTeX l1 has invalid payload/);
    expect(normalized!.elements).toHaveLength(0);
  });

  it('rejects unsupported element type', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ id: 'u1', type: 'polygon', x: 0, y: 0 }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Unsupported element type at 0/);
    expect(normalized!.elements).toHaveLength(0);
  });
});
