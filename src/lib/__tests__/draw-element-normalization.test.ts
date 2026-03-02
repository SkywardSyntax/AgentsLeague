import { describe, expect, it } from 'vitest';
import { normalizeDrawBatchPayload } from '@/lib/schema';

describe('iter28 · DrawElement normalization transforms', () => {
  it('rect with width/height aliases normalizes to w/h', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b1',
      elements: [{ type: 'rect', id: 'r1', x: 10, y: 20, width: 100, height: 50 }],
    });
    expect(normalized).not.toBeNull();
    const el = normalized!.elements[0]!;
    expect(el.type).toBe('rect');
    if (el.type === 'rect') {
      expect(el.w).toBe(100);
      expect(el.h).toBe(50);
      expect((el as Record<string, unknown>).width).toBeUndefined();
      expect((el as Record<string, unknown>).height).toBeUndefined();
    }
    expect(warnings).toHaveLength(0);
  });

  it('ellipse with x/y/width/height normalizes to cx/cy/rx/ry', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'b2',
      elements: [{ type: 'ellipse', id: 'e1', x: 100, y: 200, width: 60, height: 40 }],
    });
    expect(normalized).not.toBeNull();
    const el = normalized!.elements[0]!;
    expect(el.type).toBe('ellipse');
    if (el.type === 'ellipse') {
      expect(el.cx).toBe(100);
      expect(el.cy).toBe(200);
      expect(el.rx).toBe(30);
      expect(el.ry).toBe(20);
    }
    expect(warnings).toHaveLength(0);
  });

  it('line with x1/y1/x2/y2 normalizes to from/to points', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b3',
      elements: [{ type: 'line', id: 'l1', x1: 0, y1: 0, x2: 100, y2: 200 }],
    });
    expect(normalized).not.toBeNull();
    const el = normalized!.elements[0]!;
    expect(el.type).toBe('line');
    if (el.type === 'line') {
      expect(el.from).toEqual({ x: 0, y: 0 });
      expect(el.to).toEqual({ x: 100, y: 200 });
    }
  });

  it('arrow with x1/y1/x2/y2 normalizes to from/to points', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b4',
      elements: [{ type: 'arrow', id: 'a1', x1: 5, y1: 10, x2: 50, y2: 60 }],
    });
    expect(normalized).not.toBeNull();
    const el = normalized!.elements[0]!;
    expect(el.type).toBe('arrow');
    if (el.type === 'arrow') {
      expect(el.from).toEqual({ x: 5, y: 10 });
      expect(el.to).toEqual({ x: 50, y: 60 });
    }
  });

  it('auto-generates element IDs when missing', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b5',
      elements: [
        { type: 'rect', x: 0, y: 0, w: 10, h: 10 },
        { type: 'clear' },
      ],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.elements[0]!.id).toBe('element-1');
    expect(normalized!.elements[1]!.id).toBe('element-2');
  });

  it('latex with latex alias normalizes to tex field', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b6',
      elements: [{ type: 'latex', id: 'lx1', x: 0, y: 0, latex: '\\frac{a}{b}' }],
    });
    expect(normalized).not.toBeNull();
    const el = normalized!.elements[0]!;
    if (el.type === 'latex') {
      expect(el.tex).toBe('\\frac{a}{b}');
    }
  });

  it('latex with size alias normalizes to fontSize', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b7',
      elements: [{ type: 'latex', id: 'lx2', x: 0, y: 0, tex: 'x^2', size: 24 }],
    });
    expect(normalized).not.toBeNull();
    const el = normalized!.elements[0]!;
    if (el.type === 'latex') {
      expect(el.fontSize).toBe(24);
    }
  });

  it('text with content alias normalizes to text field', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'b8',
      elements: [{ type: 'text', id: 't1', x: 0, y: 0, content: 'hello world' }],
    });
    expect(normalized).not.toBeNull();
    const el = normalized!.elements[0]!;
    if (el.type === 'text') {
      expect(el.text).toBe('hello world');
    }
  });

  it('normalization is idempotent — normalizing output again yields same result', () => {
    const input = {
      batch_id: 'idem',
      style_preset: 'rough_sketch',
      elements: [
        { type: 'rect', id: 'r1', x: 0, y: 0, w: 50, h: 30 },
        { type: 'line', id: 'l1', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
        { type: 'latex', id: 'lx1', x: 5, y: 5, tex: 'e=mc^2', displayMode: true },
      ],
    };
    const first = normalizeDrawBatchPayload(input);
    const second = normalizeDrawBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
    expect(second.warnings).toHaveLength(0);
  });

  it('batch_id auto-generated when missing, style_preset preserved when valid', () => {
    const { normalized } = normalizeDrawBatchPayload({
      style_preset: 'blueprint_neat',
      elements: [{ type: 'clear', id: 'c1' }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.batch_id).toMatch(/^batch-/);
    expect(normalized!.style_preset).toBe('blueprint_neat');
  });
});
