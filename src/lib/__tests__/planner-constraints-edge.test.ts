import { describe, expect, it } from 'vitest';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner/constraints';
import type { DrawBatch, DrawElement } from '@/types/agent';

function makeBatch(elements: DrawElement[]): DrawBatch {
  return { elements } as DrawBatch;
}

describe('planner constraints — boundsOf edge cases', () => {
  it('computes bounds for ellipse element', () => {
    const batch = makeBatch([
      { type: 'ellipse', cx: 100, cy: 100, rx: 50, ry: 30, color: '#000', strokeWidth: 1, id: 'e1' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    expect(result.batch.elements).toHaveLength(1);
    expect(result.fallbackUsed).toBe(false);
  });

  it('computes bounds for line element', () => {
    const batch = makeBatch([
      { type: 'line', from: { x: 10, y: 10 }, to: { x: 200, y: 200 }, color: '#000', strokeWidth: 1, id: 'l1' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    expect(result.batch.elements).toHaveLength(1);
  });

  it('shifts text element with default size to stay within canvas bounds', () => {
    const batch = makeBatch([
      { type: 'text', x: -50, y: -50, text: 'Hello', id: 't1' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    const el = result.batch.elements[0] as { x: number; y: number };
    expect(el.x).toBeGreaterThanOrEqual(0);
  });

  it('computes latex bounds with center alignment', () => {
    const batch = makeBatch([
      { type: 'latex', x: 400, y: 200, tex: '\\frac{1}{2}', displayMode: true, align: 'center', fontSize: 20, id: 'lx1' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    expect(result.batch.elements).toHaveLength(1);
  });

  it('computes latex bounds with right alignment', () => {
    const batch = makeBatch([
      { type: 'latex', x: 400, y: 200, tex: 'x^2', displayMode: false, align: 'right', fontSize: 20, id: 'lx2' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    expect(result.batch.elements).toHaveLength(1);
  });

  it('handles complex latex with matrices, fracs, and line breaks', () => {
    const complexTex = '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} + \\frac{\\sqrt{x}}{\\sum_{i=0}^{n} i}';
    const batch = makeBatch([
      { type: 'latex', x: 100, y: 100, tex: complexTex, displayMode: true, fontSize: 20, id: 'lx3' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    expect(result.batch.elements).toHaveLength(1);
  });

  it('returns null bounds for unknown element type', () => {
    const batch = makeBatch([
      { type: 'unknown_shape', x: 0, y: 0, id: 'u1' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    expect(result.batch.elements).toHaveLength(1);
  });

  it('adjusts zero-length arrow to minimum legibility length', () => {
    const batch = makeBatch([
      { type: 'arrow', from: { x: 100, y: 100 }, to: { x: 100, y: 100 }, color: '#000', strokeWidth: 1, id: 'a1' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    const arrow = result.batch.elements[0] as { to: { x: number; y: number } };
    expect(result.violationsFixed).toContain('arrow_endpoint_adjust');
    const dx = arrow.to.x - 100;
    const dy = arrow.to.y - 100;
    expect(Math.hypot(dx, dy)).toBeCloseTo(28, 0);
  });

  it('detects text overlap and triggers fallback reflow', () => {
    const batch = makeBatch([
      { type: 'text', x: 100, y: 100, text: 'First label', size: 18, id: 'txt1' } as unknown as DrawElement,
      { type: 'text', x: 100, y: 102, text: 'Second label', size: 18, id: 'txt2' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    expect(result.batch.elements).toHaveLength(2);
  });

  it('shifts elements that exceed canvas right/bottom margins', () => {
    const batch = makeBatch([
      { type: 'rect', x: 1550, y: 1150, w: 100, h: 100, color: '#000', strokeWidth: 1, id: 'r1' } as unknown as DrawElement,
    ]);
    const result = enforceDrawBatchConstraints(batch);
    const el = result.batch.elements[0] as { x: number; y: number };
    expect(el.x).toBeLessThan(1550);
  });
});
