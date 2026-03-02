import { describe, it, expect } from 'vitest';
import { normalizeDrawBatchPayload, DrawBatchSchema } from '../schema';

describe('normalizeDrawBatchPayload round-trip', () => {
  it('round-trips rect without warnings', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [{ id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 }],
    });
    expect(warnings).toEqual([]);
    expect(normalized!.elements[0].type).toBe('rect');
    expect(DrawBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('round-trips ellipse without warnings', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [{ id: 'e1', type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 }],
    });
    expect(warnings).toEqual([]);
    expect(normalized!.elements[0].type).toBe('ellipse');
    expect(DrawBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('round-trips line without warnings', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [{ id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }],
    });
    expect(warnings).toEqual([]);
    expect(normalized!.elements[0].type).toBe('line');
    expect(DrawBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('round-trips arrow without warnings', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [{ id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }],
    });
    expect(warnings).toEqual([]);
    expect(normalized!.elements[0].type).toBe('arrow');
    expect(DrawBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('round-trips text without warnings', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [{ id: 't1', type: 'text', x: 0, y: 0, text: 'hello' }],
    });
    expect(warnings).toEqual([]);
    expect(normalized!.elements[0].type).toBe('text');
    expect(DrawBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('round-trips latex without warnings', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [{ id: 'x1', type: 'latex', x: 0, y: 0, tex: 'x^2' }],
    });
    expect(warnings).toEqual([]);
    expect(normalized!.elements[0].type).toBe('latex');
    expect(DrawBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('round-trips clear without warnings', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [{ id: 'c1', type: 'clear' }],
    });
    expect(warnings).toEqual([]);
    expect(normalized!.elements[0].type).toBe('clear');
    expect(DrawBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('round-trips all 7 types in one batch without warnings', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [
        { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
        { id: 'e1', type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 },
        { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
        { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
        { id: 't1', type: 'text', x: 0, y: 0, text: 'hello' },
        { id: 'x1', type: 'latex', x: 0, y: 0, tex: 'x^2' },
        { id: 'c1', type: 'clear' },
      ],
    });
    expect(normalized!.elements).toHaveLength(7);
    expect(warnings).toEqual([]);
    expect(DrawBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('unknown type produces warning and drops element', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b',
      elements: [{ id: 'u1', type: 'hexagon', points: [] }],
    });
    expect(warnings).toContain('Unsupported element type at 0');
    expect(normalized!.elements).toHaveLength(0);
  });
});
