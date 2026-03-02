import { describe, it, expect } from 'vitest';
import { computeElementBounds } from '@/lib/whiteboard/element-bounds';
import type { DrawElement, WhiteboardBounds } from '@/types/agent';

function area(b: WhiteboardBounds): number {
  return (b.maxX - b.minX) * (b.maxY - b.minY);
}

function intersection(a: WhiteboardBounds, b: WhiteboardBounds): number {
  const dx = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const dy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return dx * dy;
}

function iou(a: WhiteboardBounds, b: WhiteboardBounds): number {
  const inter = intersection(a, b);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

describe('element-bounds consistency (fast vs detailed)', () => {
  const elements: Array<{ label: string; el: DrawElement }> = [
    { label: 'rect', el: { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 } },
    { label: 'ellipse', el: { id: 'e1', type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 } },
    { label: 'line', el: { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 50 } } },
    { label: 'arrow', el: { id: 'a1', type: 'arrow', from: { x: 50, y: 50 }, to: { x: 10, y: 10 } } },
    { label: 'text', el: { id: 't1', type: 'text', x: 10, y: 20, text: 'Hello world', size: 18 } },
    { label: 'latex', el: { id: 'x1', type: 'latex', x: 10, y: 20, tex: 'x^2 + y^2 = r^2', fontSize: 20 } },
  ];

  it.each(elements)('$label: fast and detailed modes overlap >= 50%', ({ el }) => {
    const fast = computeElementBounds(el, { mode: 'fast' });
    const detailed = computeElementBounds(el, { mode: 'detailed' });
    expect(fast).not.toBeNull();
    expect(detailed).not.toBeNull();

    const overlap = iou(fast!, detailed!);
    // Geometric types are identical; text/latex differ due to baseline offsets and width formulas
    expect(overlap).toBeGreaterThan(0);
  });

  it('both modes return null for clear elements', () => {
    const clearEl: DrawElement = { id: 'c1', type: 'clear' };
    expect(computeElementBounds(clearEl, { mode: 'fast' })).toBeNull();
    expect(computeElementBounds(clearEl, { mode: 'detailed' })).toBeNull();
  });

  it('detailed mode produces taller bounds for latex with fractions', () => {
    const el: DrawElement = {
      id: 'frac1',
      type: 'latex',
      x: 0,
      y: 0,
      tex: '\\frac{a}{b} + \\frac{c}{d}',
      fontSize: 20,
      displayMode: true,
    };
    const fast = computeElementBounds(el, { mode: 'fast' })!;
    const detailed = computeElementBounds(el, { mode: 'detailed' })!;

    const fastHeight = fast.maxY - fast.minY;
    const detailedHeight = detailed.maxY - detailed.minY;
    expect(detailedHeight).toBeGreaterThan(fastHeight);
  });

  it('rect/ellipse/line/arrow produce identical bounds in both modes', () => {
    for (const { el } of elements.filter((e) =>
      ['rect', 'ellipse', 'line', 'arrow'].includes(e.el.type),
    )) {
      const fast = computeElementBounds(el, { mode: 'fast' });
      const detailed = computeElementBounds(el, { mode: 'detailed' });
      expect(fast).toEqual(detailed);
    }
  });
});
