import { describe, expect, it } from 'vitest';
import { normalizeDrawBatchPayload } from '@/lib/schema';

describe('normalizeDrawBatchPayload', () => {
  it('normalizes a valid batch with rect/line/text elements', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [
        { type: 'rect', id: 'r1', x: 0, y: 0, w: 100, h: 50 },
        { type: 'line', id: 'l1', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
        { type: 'text', id: 't1', x: 5, y: 5, text: 'hello' },
      ],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.batch_id).toBe('b1');
    expect(normalized!.elements).toHaveLength(3);
    expect(warnings).toHaveLength(0);
  });

  it('returns null-like normalized for non-object payload', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload('not-an-object');
    expect(normalized).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('strips element with unknown type and adds warning', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b2',
      elements: [
        { type: 'hexagon', id: 'h1', x: 0, y: 0 },
      ],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings.some(w => w.includes('Unsupported'))).toBe(true);
  });

  it('coerces rect width/height aliases to standard form', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b3',
      elements: [
        { type: 'rect', id: 'r2', x: 10, y: 20, width: 30, height: 40 },
      ],
    });
    expect(normalized).not.toBeNull();
    const rect = normalized!.elements[0];
    expect(rect).toMatchObject({ type: 'rect', x: 10, y: 20, w: 30, h: 40 });
    expect(warnings).toHaveLength(0);
  });

  it('handles empty elements array', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b4',
      elements: [],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.elements).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('generates batch_id when missing', () => {
    const { normalized } = normalizeDrawBatchPayload({
      elements: [{ type: 'clear', id: 'c1' }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.batch_id).toMatch(/^batch-/);
  });
});
