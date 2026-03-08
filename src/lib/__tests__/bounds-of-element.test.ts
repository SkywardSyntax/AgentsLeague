import { describe, expect, it } from 'vitest';
import { boundsOfElement, strokesBoundingBox } from '@/lib/whiteboard/geometry';
import type { DrawElement } from '@/types/agent';

describe('boundsOfElement', () => {
  it('rect with positive dimensions', () => {
    const b = boundsOfElement({ type: 'rect', id: 'r1', x: 10, y: 20, w: 30, h: 40 });
    expect(b).toEqual({ minX: 10, maxX: 40, minY: 20, maxY: 60, width: 30, height: 40 });
  });

  it('zero-size rect (w=0, h=0) returns null (non-positive dimensions)', () => {
    const b = boundsOfElement({ type: 'rect', id: 'r2', x: 5, y: 5, w: 0, h: 0 });
    expect(b).toBeNull();
  });

  it('negative width rect returns null (non-positive dimension)', () => {
    const b = boundsOfElement({ type: 'rect', id: 'r3', x: 50, y: 10, w: -30, h: 20 });
    expect(b).toBeNull();
  });

  it('ellipse with rx=0 returns null (non-positive radius)', () => {
    const b = boundsOfElement({ type: 'ellipse', id: 'e1', cx: 10, cy: 20, rx: 0, ry: 15 });
    expect(b).toBeNull();
  });

  it('ellipse with normal radii', () => {
    const b = boundsOfElement({ type: 'ellipse', id: 'e2', cx: 50, cy: 50, rx: 20, ry: 10 });
    expect(b).toEqual({ minX: 30, maxX: 70, minY: 40, maxY: 60, width: 40, height: 20 });
  });

  it('line where from === to yields point bounds', () => {
    const b = boundsOfElement({ type: 'line', id: 'l1', from: { x: 7, y: 8 }, to: { x: 7, y: 8 } });
    expect(b!.width).toBe(0);
    expect(b!.height).toBe(0);
    expect(b!.minX).toBe(7);
    expect(b!.minY).toBe(8);
  });

  it('arrow where from === to yields point bounds', () => {
    const b = boundsOfElement({ type: 'arrow', id: 'a1', from: { x: 3, y: 4 }, to: { x: 3, y: 4 } });
    expect(b!.width).toBe(0);
    expect(b!.height).toBe(0);
  });

  it('text with empty string yields minimum fontSize-based bounds', () => {
    const b = boundsOfElement({ type: 'text', id: 't1', x: 10, y: 20, text: '', size: 18 });
    expect(b).not.toBeNull();
    expect(b!.width).toBe(18); // max(fontSize, 0 * ...) = fontSize
    expect(b!.height).toBeCloseTo(23.4); // 1 line * 18 * 1.3
  });

  it('latex with empty tex string returns null', () => {
    const b = boundsOfElement({ type: 'latex', id: 'x1', x: 0, y: 0, tex: '' });
    expect(b).toBeNull();
  });

  it('clear element returns null', () => {
    expect(boundsOfElement({ type: 'clear', id: 'c1' })).toBeNull();
  });
});

describe('boundsOfElement — NaN/Infinity defense', () => {
  it('rect with x: NaN returns null', () => {
    expect(boundsOfElement({ type: 'rect', id: 'r', x: NaN, y: 0, w: 10, h: 10 })).toBeNull();
  });

  it('rect with w: Infinity returns null', () => {
    expect(boundsOfElement({ type: 'rect', id: 'r', x: 0, y: 0, w: Infinity, h: 10 })).toBeNull();
  });

  it('ellipse with rx: Infinity returns null', () => {
    expect(boundsOfElement({ type: 'ellipse', id: 'e', cx: 0, cy: 0, rx: Infinity, ry: 10 })).toBeNull();
  });

  it('ellipse with cy: NaN returns null', () => {
    expect(boundsOfElement({ type: 'ellipse', id: 'e', cx: 0, cy: NaN, rx: 5, ry: 10 })).toBeNull();
  });

  it('arrow with from.x: NaN returns null', () => {
    expect(boundsOfElement({ type: 'arrow', id: 'a', from: { x: NaN, y: 0 }, to: { x: 10, y: 10 } })).toBeNull();
  });

  it('line with to.y: -Infinity returns null', () => {
    expect(boundsOfElement({ type: 'line', id: 'l', from: { x: 0, y: 0 }, to: { x: 10, y: -Infinity } })).toBeNull();
  });

  it('text with x: -Infinity returns null', () => {
    expect(boundsOfElement({ type: 'text', id: 't', x: -Infinity, y: 0, text: 'hi' })).toBeNull();
  });

  it('text with size: NaN returns null', () => {
    expect(boundsOfElement({ type: 'text', id: 't', x: 0, y: 0, text: 'hi', size: NaN })).toBeNull();
  });

  it('latex with y: NaN and fontSize: NaN returns null', () => {
    expect(boundsOfElement({ type: 'latex', id: 'x', x: 0, y: NaN, tex: 'x', fontSize: NaN })).toBeNull();
  });

  it('latex with x: Infinity returns null', () => {
    expect(boundsOfElement({ type: 'latex', id: 'x', x: Infinity, y: 0, tex: 'x' })).toBeNull();
  });
});

describe('strokesBoundingBox — mixed valid and NaN elements integration', () => {
  it('ignores NaN elements and computes bounds from valid ones', () => {
    const validRect: DrawElement = { type: 'rect', id: 'r1', x: 0, y: 0, w: 100, h: 50 };
    const nanRect: DrawElement = { type: 'rect', id: 'r2', x: NaN, y: 0, w: 10, h: 10 };
    const validEllipse: DrawElement = { type: 'ellipse', id: 'e1', cx: 200, cy: 200, rx: 20, ry: 20 };

    const elements = [validRect, nanRect, validEllipse];
    const pointSets = elements
      .map(el => boundsOfElement(el))
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .map(b => ({ points: [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY }] }));

    const result = strokesBoundingBox(pointSets);
    expect(result).not.toBeNull();
    expect(result!.minX).toBe(0);
    expect(result!.minY).toBe(0);
    expect(result!.maxX).toBe(220);
    expect(result!.maxY).toBe(220);
  });

  it('returns null when all elements have NaN coordinates', () => {
    const nan1: DrawElement = { type: 'rect', id: 'r1', x: NaN, y: 0, w: 10, h: 10 };
    const nan2: DrawElement = { type: 'ellipse', id: 'e1', cx: Infinity, cy: 0, rx: 5, ry: 5 };

    const elements = [nan1, nan2];
    const pointSets = elements
      .map(el => boundsOfElement(el))
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .map(b => ({ points: [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY }] }));

    const result = strokesBoundingBox(pointSets);
    expect(result).toBeNull();
  });
});
