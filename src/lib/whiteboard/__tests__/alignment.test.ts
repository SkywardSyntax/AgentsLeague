import { describe, it, expect } from 'vitest';
import { computeAlignmentGuides } from '../alignment';
import type { DrawElement } from '@/types/agent';

describe('computeAlignmentGuides', () => {
  it('returns no guides for an empty element list', () => {
    expect(computeAlignmentGuides([])).toEqual([]);
  });

  it('returns no guides for a single element', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 100, y: 100, w: 50, h: 50 },
    ];
    expect(computeAlignmentGuides(elements)).toEqual([]);
  });

  it('detects two horizontally aligned rects (same y edge)', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 50, y: 100, w: 80, h: 40 },
      { id: 'r2', type: 'rect', x: 200, y: 100, w: 60, h: 30 },
    ];
    const guides = computeAlignmentGuides(elements);
    const yGuides = guides.filter((g) => g.axis === 'y');
    expect(yGuides.length).toBeGreaterThanOrEqual(1);
    expect(yGuides.some((g) => Math.abs(g.value - 100) <= 1)).toBe(true);
  });

  it('detects two vertically aligned rects (same x edge)', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 100, y: 50, w: 80, h: 40 },
      { id: 'r2', type: 'rect', x: 100, y: 200, w: 60, h: 30 },
    ];
    const guides = computeAlignmentGuides(elements);
    const xGuides = guides.filter((g) => g.axis === 'x');
    expect(xGuides.length).toBeGreaterThanOrEqual(1);
    expect(xGuides.some((g) => Math.abs(g.value - 100) <= 1)).toBe(true);
  });

  it('produces a guide within tolerance (4px) but not beyond (6px)', () => {
    // 4px apart → should produce a guide
    const withinTolerance: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 100, y: 100, w: 50, h: 50 },
      { id: 'r2', type: 'rect', x: 104, y: 200, w: 50, h: 50 },
    ];
    const guidesClose = computeAlignmentGuides(withinTolerance);
    const xGuidesClose = guidesClose.filter((g) => g.axis === 'x');
    expect(xGuidesClose.length).toBeGreaterThanOrEqual(1);

    // 6px apart → should NOT produce a guide at those positions
    const beyondTolerance: DrawElement[] = [
      { id: 'r3', type: 'rect', x: 100, y: 100, w: 50, h: 50 },
      { id: 'r4', type: 'rect', x: 106, y: 200, w: 44, h: 50 },
    ];
    const guidesFar = computeAlignmentGuides(beyondTolerance);
    // Neither left edge (100 vs 106) nor right edge (150 vs 150) → right edges DO match
    // So test that left edges specifically do NOT match
    const xGuidesFar = guidesFar.filter((g) => g.axis === 'x');
    const hasLeftEdgeGuide = xGuidesFar.some((g) => Math.abs(g.value - 103) <= 2);
    expect(hasLeftEdgeGuide).toBe(false);
  });

  it('finds shared y guide when three elements share the same y', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 50, y: 200, w: 40, h: 30 },
      { id: 'r2', type: 'rect', x: 150, y: 200, w: 40, h: 30 },
      { id: 'r3', type: 'rect', x: 250, y: 200, w: 40, h: 30 },
    ];
    const guides = computeAlignmentGuides(elements);
    const yGuides = guides.filter((g) => g.axis === 'y' && Math.abs(g.value - 200) <= 1);
    // All three share y=200 → exactly one deduplicated guide at y≈200
    expect(yGuides.length).toBe(1);
  });
});
