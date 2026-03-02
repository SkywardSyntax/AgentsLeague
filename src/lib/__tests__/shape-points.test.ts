import { describe, expect, it } from 'vitest';
import {
  rectPoints,
  ellipsePoints,
  linePoints,
  arrowHeadPoints,
  strokeWidthForPreset,
} from '@/lib/whiteboard/shape-points';

describe('shape-points', () => {
  describe('rectPoints', () => {
    it('returns a 5-point closed polygon', () => {
      const pts = rectPoints({ type: 'rect', id: 'r1', x: 0, y: 0, w: 10, h: 20 });
      expect(pts).toHaveLength(5);
      expect(pts[0]).toEqual(pts[4]);
    });

    it('computes corners from x, y, w, h', () => {
      const pts = rectPoints({ type: 'rect', id: 'r1', x: 5, y: 10, w: 30, h: 40 });
      expect(pts[0]).toEqual({ x: 5, y: 10 });
      expect(pts[1]).toEqual({ x: 35, y: 10 });
      expect(pts[2]).toEqual({ x: 35, y: 50 });
      expect(pts[3]).toEqual({ x: 5, y: 50 });
    });
  });

  describe('ellipsePoints', () => {
    it('returns at least 36 points', () => {
      const pts = ellipsePoints({ type: 'ellipse', id: 'e1', cx: 50, cy: 50, rx: 30, ry: 20 });
      expect(pts.length).toBeGreaterThanOrEqual(36);
    });

    it('closes the path (first point ≈ last point)', () => {
      const pts = ellipsePoints({ type: 'ellipse', id: 'e1', cx: 0, cy: 0, rx: 10, ry: 10 });
      expect(pts[0]!.x).toBeCloseTo(pts[pts.length - 1]!.x, 5);
      expect(pts[0]!.y).toBeCloseTo(pts[pts.length - 1]!.y, 5);
    });

    it('generates more points for larger ellipses', () => {
      const small = ellipsePoints({ type: 'ellipse', id: 'e1', cx: 0, cy: 0, rx: 5, ry: 5 });
      const large = ellipsePoints({ type: 'ellipse', id: 'e2', cx: 0, cy: 0, rx: 200, ry: 200 });
      expect(large.length).toBeGreaterThan(small.length);
    });
  });

  describe('linePoints', () => {
    it('returns from and to as two points', () => {
      const pts = linePoints({
        type: 'line', id: 'l1',
        from: { x: 0, y: 0 }, to: { x: 100, y: 50 },
      });
      expect(pts).toHaveLength(2);
      expect(pts[0]).toEqual({ x: 0, y: 0 });
      expect(pts[1]).toEqual({ x: 100, y: 50 });
    });
  });

  describe('arrowHeadPoints', () => {
    it('returns two head arrays each with 2 points', () => {
      const heads = arrowHeadPoints({
        type: 'arrow', id: 'a1',
        from: { x: 0, y: 0 }, to: { x: 100, y: 0 },
      });
      expect(heads).toHaveLength(2);
      expect(heads[0]).toHaveLength(2);
      expect(heads[1]).toHaveLength(2);
    });

    it('head points converge at the arrow tip', () => {
      const heads = arrowHeadPoints({
        type: 'arrow', id: 'a1',
        from: { x: 0, y: 0 }, to: { x: 50, y: 50 },
      });
      expect(heads[0]![1]).toEqual({ x: 50, y: 50 });
      expect(heads[1]![1]).toEqual({ x: 50, y: 50 });
    });
  });

  describe('strokeWidthForPreset', () => {
    it('returns base * 1.15 for rough_sketch', () => {
      expect(strokeWidthForPreset('rough_sketch', 2)).toBeCloseTo(2.3);
    });

    it('returns base * 0.88 for blueprint_neat', () => {
      expect(strokeWidthForPreset('blueprint_neat', 2)).toBeCloseTo(1.76);
    });

    it('returns base for undefined / clean_pen_sketch', () => {
      expect(strokeWidthForPreset(undefined, 1.5)).toBe(1.5);
      expect(strokeWidthForPreset('clean_pen_sketch', 1.5)).toBe(1.5);
    });
  });
});
