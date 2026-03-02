import { describe, expect, it } from 'vitest';
import { boundsOfElement } from '@/lib/whiteboard/geometry';
import type { DrawElement } from '@/types/agent';

describe('boundsOfElement', () => {
  it('rect with positive dimensions', () => {
    const b = boundsOfElement({ type: 'rect', id: 'r1', x: 10, y: 20, w: 30, h: 40 });
    expect(b).toEqual({ minX: 10, maxX: 40, minY: 20, maxY: 60, width: 30, height: 40 });
  });

  it('zero-size rect (w=0, h=0) yields degenerate bounds', () => {
    const b = boundsOfElement({ type: 'rect', id: 'r2', x: 5, y: 5, w: 0, h: 0 });
    expect(b).not.toBeNull();
    expect(b!.width).toBe(0);
    expect(b!.height).toBe(0);
    expect(b!.minX).toBe(5);
    expect(b!.maxX).toBe(5);
  });

  it('negative width rect still gives correct minX/maxX ordering', () => {
    const b = boundsOfElement({ type: 'rect', id: 'r3', x: 50, y: 10, w: -30, h: 20 });
    expect(b!.minX).toBe(20);
    expect(b!.maxX).toBe(50);
    expect(b!.width).toBe(30);
  });

  it('ellipse with rx=0 yields vertical line bounds', () => {
    const b = boundsOfElement({ type: 'ellipse', id: 'e1', cx: 10, cy: 20, rx: 0, ry: 15 });
    expect(b!.minX).toBe(10);
    expect(b!.maxX).toBe(10);
    expect(b!.width).toBe(0);
    expect(b!.height).toBe(30);
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
    expect(b!.height).toBe(18);
  });

  it('latex with empty tex string yields minimum fontSize-based bounds', () => {
    const b = boundsOfElement({ type: 'latex', id: 'x1', x: 0, y: 0, tex: '' });
    expect(b).not.toBeNull();
    expect(b!.width).toBeGreaterThan(0);
    expect(b!.height).toBe(20); // default fontSize
  });

  it('clear element returns null', () => {
    expect(boundsOfElement({ type: 'clear', id: 'c1' })).toBeNull();
  });
});
