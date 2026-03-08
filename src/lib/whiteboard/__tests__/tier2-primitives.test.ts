import { describe, it, expect } from 'vitest';
import type { DrawElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';
import {
  lowerPlannedLayoutToDrawBatch,
  lowerMathPrimitive,
} from '../planner/lowerer';
import { DrawBatchSchema } from '@/lib/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLayout(elements: DrawElement[]): PlannedSemanticLayout {
  return {
    batchId: 'test-batch',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    semanticBatch: { batch_id: 'test-batch', template: 'freeform_semantic', blocks: [] },
    warnings: [],
  };
}

function lowerSingle(el: DrawElement) {
  const layout = makeLayout([el]);
  return lowerPlannedLayoutToDrawBatch(layout, { maxElements: 200 });
}

function countByType(elements: DrawElement[], type: string) {
  return elements.filter((e) => e.type === type).length;
}

function hasNoNaN(elements: DrawElement[]) {
  const json = JSON.stringify(elements);
  return !json.includes('NaN') && !json.includes('null');
}

// ===========================================================================
// circle_with_radius
// ===========================================================================
describe('expandCircleWithRadius', () => {
  const baseCircle: DrawElement = {
    id: 'circle-1',
    type: 'circle_with_radius',
    cx: 400,
    cy: 300,
    r: 100,
    label: 'r = 5',
    showCenter: true,
    showRadius: true,
  };

  it('produces 1 ellipse (circle) + 1 small ellipse (center) + 1 line (radius) + 1+ text (label)', () => {
    const batch = lowerSingle(baseCircle);
    expect(batch.elements.length).toBeGreaterThan(0);
    expect(countByType(batch.elements, 'ellipse')).toBe(2); // circle + center dot
    expect(countByType(batch.elements, 'line')).toBe(1);    // radius line
    expect(countByType(batch.elements, 'text')).toBeGreaterThanOrEqual(1); // label
  });

  it('validates via DrawBatchSchema.safeParse', () => {
    const batch = lowerSingle(baseCircle);
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('lowers without NaN coordinates', () => {
    const batch = lowerSingle(baseCircle);
    expect(hasNoNaN(batch.elements)).toBe(true);
  });

  it('works via lowerMathPrimitive directly', () => {
    const lowered = lowerMathPrimitive(baseCircle as Parameters<typeof lowerMathPrimitive>[0]);
    expect(lowered.length).toBeGreaterThan(0);
    expect(countByType(lowered, 'ellipse')).toBe(2);
  });

  it('omits center dot and radius line when disabled', () => {
    const el: DrawElement = {
      ...baseCircle,
      type: 'circle_with_radius',
      showCenter: false,
      showRadius: false,
    } as DrawElement;
    const batch = lowerSingle(el);
    expect(countByType(batch.elements, 'ellipse')).toBe(1); // just the circle
    expect(countByType(batch.elements, 'line')).toBe(0);
  });

  it('uses custom radiusAngle', () => {
    const el: DrawElement = {
      ...baseCircle,
      type: 'circle_with_radius',
      radiusAngle: 0,
    } as DrawElement;
    const batch = lowerSingle(el);
    const lines = batch.elements.filter((e) => e.type === 'line');
    expect(lines.length).toBe(1);
    // At angle 0, the radius endpoint should be at (cx + r, cy)
    const line = lines[0]! as { type: 'line'; from: { x: number; y: number }; to: { x: number; y: number } };
    expect(line.to.x).toBeCloseTo(500, 0);  // 400 + 100
    expect(line.to.y).toBeCloseTo(300, 0);
  });
});

// ===========================================================================
// triangle_with_angles
// ===========================================================================
describe('expandTriangleWithAngles', () => {
  // Equilateral triangle
  const sideLen = 200;
  const h = sideLen * Math.sqrt(3) / 2;
  const baseTriangle: DrawElement = {
    id: 'tri-1',
    type: 'triangle_with_angles',
    vertices: [
      { x: 300, y: 400, label: 'A' },
      { x: 500, y: 400, label: 'B' },
      { x: 400, y: 400 - h, label: 'C' },
    ],
    showAngles: true,
    showSides: true,
    sideLabels: ['a', 'b', 'c'],
    angleLabels: ['α', 'β', 'γ'],
  };

  it('produces 3 lines (sides) + arc segments + 6+ text elements', () => {
    const batch = lowerSingle(baseTriangle);
    expect(batch.elements.length).toBeGreaterThan(0);
    // 3 side lines
    const lineCount = countByType(batch.elements, 'line');
    expect(lineCount).toBeGreaterThanOrEqual(3);
    // Arc segments: 3 arcs × 16 segments = 48 lines (+ 3 sides = 51 total minimum)
    expect(lineCount).toBeGreaterThanOrEqual(3 + 3 * 16);
    // Text: 3 vertex labels + 3 side labels + 3 angle labels = 9
    const textCount = countByType(batch.elements, 'text');
    expect(textCount).toBeGreaterThanOrEqual(6);
  });

  it('validates via DrawBatchSchema.safeParse', () => {
    const batch = lowerSingle(baseTriangle);
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('lowers without NaN coordinates', () => {
    const batch = lowerSingle(baseTriangle);
    expect(hasNoNaN(batch.elements)).toBe(true);
  });

  it('works via lowerMathPrimitive directly', () => {
    const lowered = lowerMathPrimitive(baseTriangle as Parameters<typeof lowerMathPrimitive>[0]);
    expect(lowered.length).toBeGreaterThan(0);
    expect(countByType(lowered, 'line')).toBeGreaterThanOrEqual(3);
  });

  it('omits angles and side labels when disabled', () => {
    const el: DrawElement = {
      ...baseTriangle,
      type: 'triangle_with_angles',
      showAngles: false,
      showSides: false,
    } as DrawElement;
    const batch = lowerSingle(el);
    // Should still have 3 side lines + 3 vertex labels
    const lineCount = countByType(batch.elements, 'line');
    expect(lineCount).toBe(3); // only side lines, no arcs
    const textCount = countByType(batch.elements, 'text');
    expect(textCount).toBe(3); // only vertex labels
  });

  it('produces correct side lines connecting vertices', () => {
    const lowered = lowerMathPrimitive(baseTriangle as Parameters<typeof lowerMathPrimitive>[0]);
    const sideLines = lowered.filter((e) => e.id.includes('-side-'));
    expect(sideLines.length).toBe(3);
  });
});
