import { describe, it, expect } from 'vitest';
import {
  clampElementCoordinates,
  clampBatchCoordinates,
  COORD_BOUNDS,
} from '@/lib/whiteboard/clamp-coordinates';
import type { DrawElement } from '@/types/agent';

describe('Coordinate System Validation', () => {
  it('rect with valid coordinates passes unchanged', () => {
    const el: DrawElement = { type: 'rect', id: 'r1', x: 100, y: 200, w: 300, h: 150 };
    expect(clampElementCoordinates(el)).toEqual(el);
  });

  it('rect with negative width is clamped to MIN_DIMENSION', () => {
    const el: DrawElement = { type: 'rect', id: 'r2', x: 100, y: 100, w: -50, h: 100 };
    const result = clampElementCoordinates(el);
    expect(result.type === 'rect' && result.w).toBe(1);
  });

  it('rect with NaN x is clamped to MIN_X', () => {
    const el: DrawElement = { type: 'rect', id: 'r3', x: NaN, y: 100, w: 50, h: 50 };
    const result = clampElementCoordinates(el);
    expect(result.type === 'rect' && result.x).toBe(COORD_BOUNDS.MIN_X);
  });

  it('rect with Infinity y is clamped to MAX_Y', () => {
    const el: DrawElement = { type: 'rect', id: 'r4', x: 100, y: Infinity, w: 50, h: 50 };
    const result = clampElementCoordinates(el);
    expect(result.type === 'rect' && result.y).toBe(COORD_BOUNDS.MAX_Y);
  });

  it('ellipse with zero radii is clamped to MIN_DIMENSION', () => {
    const el: DrawElement = { type: 'ellipse', id: 'e1', cx: 100, cy: 100, rx: 0, ry: 0 };
    const result = clampElementCoordinates(el);
    expect(result.type === 'ellipse' && result.rx).toBe(1);
    expect(result.type === 'ellipse' && result.ry).toBe(1);
  });

  it('arrow with extreme coordinates is clamped', () => {
    const el: DrawElement = {
      type: 'arrow',
      id: 'a1',
      from: { x: -99999, y: 99999 },
      to: { x: 99999, y: -99999 },
    };
    const result = clampElementCoordinates(el);
    expect(result.type === 'arrow' && result.from.x).toBe(-2000);
    expect(result.type === 'arrow' && result.from.y).toBe(4000);
    expect(result.type === 'arrow' && result.to.x).toBe(4000);
    expect(result.type === 'arrow' && result.to.y).toBe(-2000);
  });

  it('text element coordinates are clamped', () => {
    const el: DrawElement = { type: 'text', id: 't1', x: 50000, y: -50000, text: 'hello' };
    const result = clampElementCoordinates(el);
    expect(result.type === 'text' && result.x).toBe(4000);
    expect(result.type === 'text' && result.y).toBe(-2000);
  });

  it('latex element coordinates are clamped', () => {
    const el: DrawElement = { type: 'latex', id: 'l1', x: NaN, y: NaN, tex: 'x^2' };
    const result = clampElementCoordinates(el);
    expect(result.type === 'latex' && result.x).toBe(COORD_BOUNDS.MIN_X);
    expect(result.type === 'latex' && result.y).toBe(COORD_BOUNDS.MIN_Y);
  });

  it('clampBatchCoordinates processes all elements', () => {
    const elements: DrawElement[] = [
      { type: 'rect', id: 'r1', x: -99999, y: 99999, w: -10, h: 99999 },
      { type: 'arrow', id: 'a1', from: { x: -99999, y: 0 }, to: { x: 0, y: 99999 } },
      { type: 'text', id: 't1', x: NaN, y: Infinity, text: 'hi' },
    ];
    const results = clampBatchCoordinates(elements);
    expect(results).toHaveLength(3);

    const r = results[0];
    expect(r.type === 'rect' && r.x).toBe(COORD_BOUNDS.MIN_X);
    expect(r.type === 'rect' && r.w).toBe(COORD_BOUNDS.MIN_DIMENSION);

    const a = results[1];
    expect(a.type === 'arrow' && a.from.x).toBe(COORD_BOUNDS.MIN_X);

    const t = results[2];
    expect(t.type === 'text' && t.x).toBe(COORD_BOUNDS.MIN_X);
    expect(t.type === 'text' && t.y).toBe(COORD_BOUNDS.MAX_Y);
  });

  it('clear element type passes through unchanged', () => {
    const el: DrawElement = { type: 'clear', id: 'c1' };
    expect(clampElementCoordinates(el)).toEqual(el);
  });
});
