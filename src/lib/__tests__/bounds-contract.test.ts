import { describe, expect, it } from 'vitest';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '@/lib/whiteboard/context';
import type {
  ArrowElement,
  DrawElement,
  EllipseElement,
  LatexElement,
  LineElement,
  RectElement,
  TextElement,
  ClearElement,
} from '@/types/agent';

function makeRect(overrides: Partial<RectElement> = {}): RectElement {
  return { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50, ...overrides };
}

function makeEllipse(overrides: Partial<EllipseElement> = {}): EllipseElement {
  return { id: 'e1', type: 'ellipse', cx: 200, cy: 100, rx: 40, ry: 30, ...overrides };
}

function makeLine(overrides: Partial<LineElement> = {}): LineElement {
  return { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 300, y: 150 }, ...overrides };
}

function makeArrow(overrides: Partial<ArrowElement> = {}): ArrowElement {
  return { id: 'a1', type: 'arrow', from: { x: 50, y: 50 }, to: { x: 200, y: 100 }, ...overrides };
}

function makeText(overrides: Partial<TextElement> = {}): TextElement {
  return { id: 't1', type: 'text', x: 30, y: 40, text: 'hello', ...overrides };
}

function makeLatex(overrides: Partial<LatexElement> = {}): LatexElement {
  return { id: 'x1', type: 'latex', x: 50, y: 60, tex: 'E=mc^2', ...overrides };
}

function makeClear(): ClearElement {
  return { id: 'c1', type: 'clear' };
}

/**
 * Asserts that the two context systems produce geometrically equivalent bounds
 * for a given element: occupied_region {x,y,w,h} ↔ bounds {minX,minY,maxX,maxY}.
 */
function assertBoundsAgree(element: DrawElement) {
  const v2 = buildWhiteboardContextV2([element]);
  const v1 = buildWhiteboardContext([element]);

  const region = v2.occupied_regions[0];
  expect(region).toBeDefined();

  const bounds = v1.bounds;
  expect(bounds).toBeDefined();

  // Geometric equivalence: region (x,y,w,h) ↔ bounds (minX,minY,maxX,maxY)
  expect(region.x).toBeCloseTo(bounds!.minX, 5);
  expect(region.y).toBeCloseTo(bounds!.minY, 5);
  expect(region.x + region.w).toBeCloseTo(bounds!.maxX, 5);
  expect(region.y + region.h).toBeCloseTo(bounds!.maxY, 5);
}

describe('boundsOf contract: context-v2 vs context agree', () => {
  it('rect bounds agree across both implementations', () => {
    assertBoundsAgree(makeRect());
  });

  it('ellipse bounds agree across both implementations', () => {
    assertBoundsAgree(makeEllipse());
  });

  it('line bounds agree across both implementations', () => {
    assertBoundsAgree(makeLine());
  });

  it('arrow bounds agree across both implementations', () => {
    assertBoundsAgree(makeArrow());
  });

  it('text bounds agree across both implementations', () => {
    assertBoundsAgree(makeText());
  });

  it('latex bounds produce finite non-negative dimensions and same minX', () => {
    const el = makeLatex();
    const v2 = buildWhiteboardContextV2([el]);
    const v1 = buildWhiteboardContext([el]);

    const region = v2.occupied_regions[0];
    const bounds = v1.bounds;

    expect(region).toBeDefined();
    expect(bounds).toBeDefined();

    // Both use el.x for minX
    expect(region.x).toBe(bounds!.minX);

    // Both produce finite, non-negative dimensions
    expect(region.w).toBeGreaterThan(0);
    expect(region.h).toBeGreaterThan(0);
    expect(Number.isFinite(region.w)).toBe(true);
    expect(Number.isFinite(region.h)).toBe(true);

    expect(bounds!.maxX - bounds!.minX).toBeGreaterThan(0);
    expect(bounds!.maxY - bounds!.minY).toBeGreaterThan(0);
    expect(Number.isFinite(bounds!.maxX)).toBe(true);
    expect(Number.isFinite(bounds!.maxY)).toBe(true);
  });

  it('clear element produces no bounds contribution', () => {
    const el = makeClear();
    const v2 = buildWhiteboardContextV2([el]);
    const v1 = buildWhiteboardContext([el]);

    // clear should produce no occupied regions and no bounds
    expect(v2.occupied_regions).toHaveLength(0);
    expect(v1.bounds).toBeUndefined();

    // But element count should still reflect the element
    expect(v2.scene_summary.element_count).toBe(1);
    expect(v1.elementCount).toBe(1);
  });
});
