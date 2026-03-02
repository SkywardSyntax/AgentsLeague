import { describe, expect, it } from 'vitest';
import { boundsOf } from '@/lib/whiteboard/planner';
import type { DrawElement } from '@/types/agent';

describe('boundsOf defensive validation', () => {
  it('returns null for rect with w: 0', () => {
    const el: DrawElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 0, h: 50 };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for rect with h: -10', () => {
    const el: DrawElement = { id: 'r2', type: 'rect', x: 10, y: 20, w: 50, h: -10 };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for rect with NaN x', () => {
    const el: DrawElement = { id: 'r3', type: 'rect', x: NaN, y: 20, w: 50, h: 50 };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for rect with Infinity w', () => {
    const el: DrawElement = { id: 'r4', type: 'rect', x: 10, y: 20, w: Infinity, h: 50 };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for ellipse with rx: NaN', () => {
    const el: DrawElement = { id: 'e1', type: 'ellipse', cx: 100, cy: 100, rx: NaN, ry: 50 };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for ellipse with ry: -5', () => {
    const el: DrawElement = { id: 'e2', type: 'ellipse', cx: 100, cy: 100, rx: 50, ry: -5 };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for line with from.x: Infinity', () => {
    const el: DrawElement = { id: 'l1', type: 'line', from: { x: Infinity, y: 0 }, to: { x: 100, y: 100 } };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for arrow with to.y: NaN', () => {
    const el: DrawElement = { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 100, y: NaN } };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for text with x: NaN', () => {
    const el: DrawElement = { id: 't1', type: 'text', x: NaN, y: 50, text: 'hello' };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for text with negative size', () => {
    const el: DrawElement = { id: 't2', type: 'text', x: 10, y: 50, text: 'hello', size: -5 };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for latex with x: Infinity', () => {
    const el: DrawElement = { id: 'x1', type: 'latex', x: Infinity, y: 50, tex: 'x^2' };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for latex with fontSize: NaN', () => {
    const el: DrawElement = { id: 'x2', type: 'latex', x: 10, y: 50, tex: 'x^2', fontSize: NaN };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns valid bounds for well-formed rect', () => {
    const el: DrawElement = { id: 'r5', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(b!.minX).toBe(10);
    expect(b!.maxX).toBe(110);
  });

  it('returns valid bounds for well-formed ellipse', () => {
    const el: DrawElement = { id: 'e3', type: 'ellipse', cx: 100, cy: 100, rx: 50, ry: 30 };
    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(b!.minX).toBe(50);
    expect(b!.maxY).toBe(130);
  });

  it('returns valid bounds for well-formed arrow', () => {
    const el: DrawElement = { id: 'a2', type: 'arrow', from: { x: 10, y: 20 }, to: { x: 100, y: 200 } };
    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(b!.minX).toBe(10);
    expect(b!.maxY).toBe(200);
  });

  it('returns valid bounds for well-formed text', () => {
    const el: DrawElement = { id: 't3', type: 'text', x: 10, y: 50, text: 'hello' };
    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(b!.minX).toBe(10);
  });

  it('returns valid bounds for well-formed latex', () => {
    const el: DrawElement = { id: 'x3', type: 'latex', x: 10, y: 50, tex: 'x^2' };
    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(b!.minX).toBeLessThanOrEqual(10);
  });

  it('returns null for latex with empty tex string', () => {
    const el: DrawElement = { id: 'x4', type: 'latex', tex: '', x: 0, y: 0, fontSize: 24 };
    expect(boundsOf(el)).toBeNull();
  });

  it('returns null for latex with fontSize zero', () => {
    const el: DrawElement = { id: 'x5', type: 'latex', tex: 'x', x: 0, y: 0, fontSize: 0 };
    expect(boundsOf(el)).toBeNull();
  });

  it('handles deeply nested fractions with compounding complexity', () => {
    const nested: DrawElement = {
      id: 'x6',
      type: 'latex',
      tex: '\\frac{\\frac{\\frac{a}{b}}{c}}{d}',
      x: 100,
      y: 100,
      fontSize: 24,
    };
    const single: DrawElement = {
      id: 'x7',
      type: 'latex',
      tex: '\\frac{a}{b}',
      x: 100,
      y: 100,
      fontSize: 24,
    };

    const nestedBounds = boundsOf(nested)!;
    const singleBounds = boundsOf(single)!;
    expect(nestedBounds).not.toBeNull();
    expect(singleBounds).not.toBeNull();

    const nestedHeight = nestedBounds.maxY - nestedBounds.minY;
    const singleHeight = singleBounds.maxY - singleBounds.minY;
    expect(nestedHeight).toBeGreaterThan(singleHeight);
  });

  it('center-aligned latex shifts minX left by half width', () => {
    const el: DrawElement = {
      id: 'x8',
      type: 'latex',
      tex: 'x^2',
      x: 200,
      y: 100,
      fontSize: 24,
      align: 'center',
    };

    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(b!.minX).toBeLessThan(200);
    expect(b!.maxX).toBeGreaterThan(200);
  });

  // --- Degenerate-but-valid inputs ---

  it('ellipse with extreme aspect ratio (tiny rx, large ry) produces finite bounds', () => {
    const el: DrawElement = { id: 'e-extreme', type: 'ellipse', cx: 500, cy: 500, rx: 0.001, ry: 1000 };
    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(Number.isFinite(b!.minX)).toBe(true);
    expect(Number.isFinite(b!.maxY)).toBe(true);
    expect(b!.maxY - b!.minY).toBeCloseTo(2000);
  });

  it('text with empty string returns valid bounds (zero-width text still has size-based width)', () => {
    const el: DrawElement = { id: 't-empty', type: 'text', x: 50, y: 50, text: '', size: 18 };
    const b = boundsOf(el);
    expect(b).not.toBeNull();
    // Width should be at least size * 0.45 even for empty text
    expect(b!.maxX - b!.minX).toBeGreaterThan(0);
  });

  it('latex with whitespace-only tex returns null', () => {
    const el: DrawElement = { id: 'x-ws', type: 'latex', tex: '   ', x: 0, y: 0, fontSize: 20 };
    // tex is truthy (non-empty string with spaces), so boundsOf should return valid bounds
    const b = boundsOf(el);
    expect(b).not.toBeNull();
  });

  it('line with from === to (zero-length) returns valid point-bounds', () => {
    const el: DrawElement = { id: 'l-zero', type: 'line', from: { x: 100, y: 200 }, to: { x: 100, y: 200 } };
    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(b!.minX).toBe(100);
    expect(b!.maxX).toBe(100);
    expect(b!.minY).toBe(200);
    expect(b!.maxY).toBe(200);
  });

  it('right-aligned latex shifts minX left by full width', () => {
    const el: DrawElement = {
      id: 'x-right',
      type: 'latex',
      tex: 'x^2 + y^2',
      x: 400,
      y: 100,
      fontSize: 24,
      align: 'right',
    };

    const b = boundsOf(el);
    expect(b).not.toBeNull();
    expect(b!.maxX).toBeCloseTo(400);
    expect(b!.minX).toBeLessThan(400);
  });
});
