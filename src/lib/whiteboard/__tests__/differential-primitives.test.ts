import { describe, it, expect } from 'vitest';
import type { DrawElement, SlopeFieldElement, VectorField2dElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';
import { lowerPlannedLayoutToDrawBatch, lowerMathPrimitive } from '../planner/lowerer';
import { normalizeDrawBatchPayload } from '@/lib/schema';

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
  return lowerPlannedLayoutToDrawBatch(layout, { maxElements: 2000 });
}

function countByType(elements: DrawElement[], type: string) {
  return elements.filter((e) => e.type === type).length;
}

// ===========================================================================
// slope_field
// ===========================================================================
describe('expandSlopeField', () => {
  const baseSF: SlopeFieldElement = {
    id: 'sf-1',
    type: 'slope_field',
    x: 50,
    y: 50,
    width: 600,
    height: 400,
    expression: 'x - y',
    xRange: [-3, 3],
    yRange: [-3, 3],
  };

  it('expands to correct number of line segments (gridRows × gridCols)', () => {
    const rows = 12;
    const cols = 16;
    const el: SlopeFieldElement = { ...baseSF, gridRows: rows, gridCols: cols };
    const batch = lowerSingle(el);
    const lineCount = countByType(batch.elements, 'line');
    // Grid is (rows+1) × (cols+1) points
    expect(lineCount).toBe((rows + 1) * (cols + 1));
  });

  it('uses default grid size of 12 rows × 16 cols', () => {
    const batch = lowerSingle(baseSF);
    const lineCount = countByType(batch.elements, 'line');
    expect(lineCount).toBe(13 * 17); // (12+1) * (16+1)
  });

  it('with solutionCurve adds extra strokes', () => {
    const el: SlopeFieldElement = {
      ...baseSF,
      solutionCurve: { x0: 0, y0: 1, steps: 50 },
    };
    const batch = lowerSingle(el);
    const lineCount = countByType(batch.elements, 'line');
    // Should have grid ticks + solution curve segments
    const gridLines = 13 * 17;
    expect(lineCount).toBeGreaterThan(gridLines);
  });

  it('handles expressions with trig functions', () => {
    const el: SlopeFieldElement = {
      ...baseSF,
      expression: 'sin(x)*cos(y)',
      gridRows: 4,
      gridCols: 4,
    };
    const batch = lowerSingle(el);
    const lineCount = countByType(batch.elements, 'line');
    expect(lineCount).toBe(5 * 5);
  });

  it('lowered elements have correct IDs', () => {
    const el: SlopeFieldElement = { ...baseSF, gridRows: 2, gridCols: 2 };
    const lowered = lowerMathPrimitive(el);
    expect(lowered.length).toBeGreaterThan(0);
    expect(lowered.some((e) => e.id.startsWith('sf-1-tick-'))).toBe(true);
  });
});

// ===========================================================================
// vector_field_2d
// ===========================================================================
describe('expandVectorField2d', () => {
  const baseVF: VectorField2dElement = {
    id: 'vf-1',
    type: 'vector_field_2d',
    x: 50,
    y: 50,
    width: 600,
    height: 400,
    Px: '-y',
    Py: 'x',
    xRange: [-3, 3],
    yRange: [-3, 3],
  };

  it('expands to correct arrow count', () => {
    const rows = 8;
    const cols = 10;
    const el: VectorField2dElement = { ...baseVF, gridRows: rows, gridCols: cols };
    const batch = lowerSingle(el);
    const arrowCount = countByType(batch.elements, 'arrow');
    // (rows+1) * (cols+1) minus the origin where magnitude is 0
    // At (0,0), Px=-y=0 and Py=x=0, so magnitude=0, skipped
    expect(arrowCount).toBeLessThanOrEqual((rows + 1) * (cols + 1));
    expect(arrowCount).toBeGreaterThan(0);
  });

  it('normalized arrows all have same length', () => {
    const el: VectorField2dElement = {
      ...baseVF,
      normalize: true,
      gridRows: 4,
      gridCols: 4,
    };
    const lowered = lowerMathPrimitive(el);
    const arrows = lowered.filter((e) => e.type === 'arrow');
    expect(arrows.length).toBeGreaterThan(0);

    const lengths = arrows.map((a) => {
      if (a.type !== 'arrow') return 0;
      const dx = a.to.x - a.from.x;
      const dy = a.to.y - a.from.y;
      return Math.sqrt(dx * dx + dy * dy);
    }).filter((l) => l > 0);

    // All non-zero arrows should have the same length (within tolerance)
    const first = lengths[0]!;
    for (const len of lengths) {
      expect(len).toBeCloseTo(first, 1);
    }
  });

  it('uses default grid size of 8 rows × 10 cols', () => {
    const batch = lowerSingle(baseVF);
    const arrowCount = countByType(batch.elements, 'arrow');
    // Max possible: 9 * 11 = 99, minus zero-magnitude at origin
    expect(arrowCount).toBeLessThanOrEqual(9 * 11);
    expect(arrowCount).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Schema validation
// ===========================================================================
describe('schema validation', () => {
  it('validates slope_field required fields', () => {
    const payload = {
      batch_id: 'test-schema',
      elements: [{
        id: 'sf-schema-1',
        type: 'slope_field',
        x: 50, y: 50,
        width: 600, height: 400,
        expression: 'x - y',
        xRange: [-3, 3],
        yRange: [-3, 3],
      }],
    };
    const { normalized, warnings } = normalizeDrawBatchPayload(payload);
    expect(normalized).not.toBeNull();
    expect(normalized!.elements.length).toBe(1);
    expect(normalized!.elements[0]!.type).toBe('slope_field');
    expect(warnings.length).toBe(0);
  });

  it('rejects slope_field with missing expression', () => {
    const payload = {
      batch_id: 'test-schema',
      elements: [{
        id: 'sf-bad',
        type: 'slope_field',
        x: 50, y: 50,
        width: 600, height: 400,
        xRange: [-3, 3],
        yRange: [-3, 3],
      }],
    };
    const { normalized, warnings } = normalizeDrawBatchPayload(payload);
    expect(normalized!.elements.length).toBe(0);
    expect(warnings.some((w) => w.includes('SlopeField'))).toBe(true);
  });

  it('validates vector_field_2d required fields', () => {
    const payload = {
      batch_id: 'test-schema',
      elements: [{
        id: 'vf-schema-1',
        type: 'vector_field_2d',
        x: 50, y: 50,
        width: 600, height: 400,
        Px: '-y',
        Py: 'x',
        xRange: [-3, 3],
        yRange: [-3, 3],
      }],
    };
    const { normalized, warnings } = normalizeDrawBatchPayload(payload);
    expect(normalized).not.toBeNull();
    expect(normalized!.elements.length).toBe(1);
    expect(normalized!.elements[0]!.type).toBe('vector_field_2d');
    expect(warnings.length).toBe(0);
  });
});
