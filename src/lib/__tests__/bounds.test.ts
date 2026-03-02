import { describe, it, expect } from 'vitest';
import { boundsOf } from '../whiteboard/bounds';
import type { DrawElement } from '@/types/agent';

describe('boundsOf', () => {
  describe('rect', () => {
    it('returns correct bounds for a rect', () => {
      const el: DrawElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
      expect(boundsOf(el)).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
    });
  });

  describe('ellipse', () => {
    it('returns correct bounds for an ellipse', () => {
      const el: DrawElement = { id: 'e1', type: 'ellipse', cx: 100, cy: 100, rx: 30, ry: 20 };
      expect(boundsOf(el)).toEqual({ minX: 70, minY: 80, maxX: 130, maxY: 120 });
    });
  });

  describe('line', () => {
    it('returns correct bounds for a line', () => {
      const el: DrawElement = { id: 'l1', type: 'line', from: { x: 50, y: 80 }, to: { x: 10, y: 20 } };
      const b = boundsOf(el)!;
      expect(b.minX).toBe(10);
      expect(b.minY).toBe(20);
      expect(b.maxX).toBe(50);
      expect(b.maxY).toBe(80);
    });
  });

  describe('arrow', () => {
    it('returns correct bounds for an arrow', () => {
      const el: DrawElement = { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 200, y: 100 } };
      expect(boundsOf(el)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 100 });
    });
  });

  describe('text', () => {
    it('returns bounds using default size 18', () => {
      const el: DrawElement = { id: 't1', type: 'text', x: 10, y: 30, text: 'hello' };
      const b = boundsOf(el)!;
      expect(b.minX).toBe(10);
      expect(b.minY).toBeCloseTo(30 - 18 * 0.9);
      expect(b.maxX).toBeGreaterThan(10);
      expect(b.maxY).toBeCloseTo(30 + 18 * 0.5);
    });

    it('uses custom size', () => {
      const el: DrawElement = { id: 't2', type: 'text', x: 0, y: 0, text: 'AB', size: 36 };
      const b = boundsOf(el)!;
      expect(b.minY).toBeCloseTo(-36 * 0.9);
    });
  });

  describe('latex', () => {
    it('returns bounds for inline latex', () => {
      const el: DrawElement = { id: 'x1', type: 'latex', x: 50, y: 50, tex: 'x^2 + y^2' };
      const b = boundsOf(el)!;
      expect(b).not.toBeNull();
      expect(b.minX).toBe(50);
      expect(b.maxX).toBeGreaterThan(50);
      expect(b.maxY).toBeGreaterThan(50);
    });

    it('returns larger bounds for display mode', () => {
      const tex = 'x^2 + y^2';
      const inline: DrawElement = { id: 'x1', type: 'latex', x: 0, y: 100, tex };
      const display: DrawElement = { id: 'x2', type: 'latex', x: 0, y: 100, tex, displayMode: true };
      const bInline = boundsOf(inline)!;
      const bDisplay = boundsOf(display)!;
      expect(bDisplay.maxY - bDisplay.minY).toBeGreaterThan(bInline.maxY - bInline.minY);
    });

    it('accounts for fracs/matrices in bounds', () => {
      const simple: DrawElement = { id: 'x1', type: 'latex', x: 0, y: 100, tex: 'x' };
      const complex: DrawElement = { id: 'x2', type: 'latex', x: 0, y: 100, tex: '\\frac{a}{b} + \\frac{c}{d}' };
      const bSimple = boundsOf(simple)!;
      const bComplex = boundsOf(complex)!;
      expect(bComplex.maxY - bComplex.minY).toBeGreaterThan(bSimple.maxY - bSimple.minY);
    });

    it('offsets center-aligned latex', () => {
      const el: DrawElement = { id: 'x1', type: 'latex', x: 100, y: 50, tex: 'hello world', align: 'center' };
      const b = boundsOf(el)!;
      expect(b.minX).toBeLessThan(100);
      // Center: minX = x - width/2, so minX + width = maxX, and (minX + maxX)/2 ≈ x
      expect((b.minX + b.maxX) / 2).toBeCloseTo(100, 0);
    });

    it('offsets right-aligned latex', () => {
      const el: DrawElement = { id: 'x1', type: 'latex', x: 200, y: 50, tex: 'hello world', align: 'right' };
      const b = boundsOf(el)!;
      expect(b.maxX).toBeCloseTo(200, 0);
      expect(b.minX).toBeLessThan(200);
    });
  });

  describe('unknown/clear element', () => {
    it('returns null for clear element', () => {
      const el: DrawElement = { id: 'c1', type: 'clear' };
      expect(boundsOf(el)).toBeNull();
    });
  });
});
