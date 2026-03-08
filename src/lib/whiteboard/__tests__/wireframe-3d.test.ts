import { describe, it, expect } from 'vitest';
import type { DrawElement, Wireframe3dElement } from '@/types/agent';
import type { PlannedSemanticLayout } from '../planner/types';
import { lowerPlannedLayoutToDrawBatch } from '../planner/lowerer';
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

const baseCube: Wireframe3dElement = {
  id: 'w3d-1',
  type: 'wireframe_3d',
  shape: 'cube',
  cx: 400,
  cy: 300,
  size: 100,
  showHiddenLines: true,
};

// ===========================================================================
// cube
// ===========================================================================
describe('expandWireframe3d — cube', () => {
  it('generates 12 edge line segments with showHiddenLines', () => {
    const batch = lowerSingle(baseCube);
    const lineCount = countByType(batch.elements, 'line');
    expect(lineCount).toBe(12);
  });

  it('generates fewer edges without showHiddenLines (back-face culling)', () => {
    const el: Wireframe3dElement = { ...baseCube, showHiddenLines: false };
    const batch = lowerSingle(el);
    const lineCount = countByType(batch.elements, 'line');
    // With painter's algorithm, only front-facing faces are drawn
    expect(lineCount).toBeGreaterThan(0);
    expect(lineCount).toBeLessThanOrEqual(12);
  });
});

// ===========================================================================
// tetrahedron
// ===========================================================================
describe('expandWireframe3d — tetrahedron', () => {
  it('generates 6 edges with showHiddenLines', () => {
    const el: Wireframe3dElement = {
      ...baseCube,
      id: 'w3d-tet',
      shape: 'tetrahedron',
      showHiddenLines: true,
    };
    const batch = lowerSingle(el);
    const lineCount = countByType(batch.elements, 'line');
    expect(lineCount).toBe(6);
  });
});

// ===========================================================================
// axes_3d
// ===========================================================================
describe('expandWireframe3d — axes_3d', () => {
  it('generates 3 arrows and 3 text labels', () => {
    const el: Wireframe3dElement = {
      ...baseCube,
      id: 'w3d-axes',
      shape: 'axes_3d',
    };
    const batch = lowerSingle(el);
    const arrowCount = countByType(batch.elements, 'arrow');
    const textCount = countByType(batch.elements, 'text');
    expect(arrowCount).toBe(3);
    expect(textCount).toBe(3);
  });
});

// ===========================================================================
// surface
// ===========================================================================
describe('expandWireframe3d — surface', () => {
  it('generates correct line count for 2×2 grid', () => {
    const el: Wireframe3dElement = {
      ...baseCube,
      id: 'w3d-surf',
      shape: 'surface',
      expression: 'x*y',
      gridN: 2,
    };
    const batch = lowerSingle(el);
    const lineCount = countByType(batch.elements, 'line');
    // For gridN=2: (gridN+1) rows × gridN cols + (gridN+1) cols × gridN rows
    // = 3*2 + 3*2 = 12 line segments
    expect(lineCount).toBe(12);
  });

  it('handles trig expressions', () => {
    const el: Wireframe3dElement = {
      ...baseCube,
      id: 'w3d-surf-trig',
      shape: 'surface',
      expression: 'sin(x)*cos(y)',
      gridN: 4,
    };
    const batch = lowerSingle(el);
    const lineCount = countByType(batch.elements, 'line');
    // (4+1)*4 + (4+1)*4 = 20 + 20 = 40
    expect(lineCount).toBe(40);
  });
});

// ===========================================================================
// rotation affects coordinates
// ===========================================================================
describe('expandWireframe3d — rotation', () => {
  it('rotationX/Y affect projected coordinates', () => {
    const el1: Wireframe3dElement = { ...baseCube, rotationX: 0, rotationY: 0, showHiddenLines: true };
    const el2: Wireframe3dElement = { ...baseCube, rotationX: 45, rotationY: 60, showHiddenLines: true };
    const batch1 = lowerSingle(el1);
    const batch2 = lowerSingle(el2);

    // Both should produce 12 lines for a cube
    expect(countByType(batch1.elements, 'line')).toBe(12);
    expect(countByType(batch2.elements, 'line')).toBe(12);

    // Coordinates should differ between different rotations
    const lines1 = batch1.elements.filter((e) => e.type === 'line') as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
    const lines2 = batch2.elements.filter((e) => e.type === 'line') as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;

    // Collect all unique coordinates
    const coords1 = new Set(lines1.flatMap((l) => [`${l.from.x.toFixed(2)},${l.from.y.toFixed(2)}`, `${l.to.x.toFixed(2)},${l.to.y.toFixed(2)}`]));
    const coords2 = new Set(lines2.flatMap((l) => [`${l.from.x.toFixed(2)},${l.from.y.toFixed(2)}`, `${l.to.x.toFixed(2)},${l.to.y.toFixed(2)}`]));

    // They should not be the same set of coordinates
    const intersection = [...coords1].filter((c) => coords2.has(c));
    expect(intersection.length).toBeLessThan(coords1.size);
  });
});

// ===========================================================================
// schema validation
// ===========================================================================
describe('wireframe_3d schema normalization', () => {
  it('validates required fields (shape, cx, cy, size)', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test',
      elements: [
        { id: 'w1', type: 'wireframe_3d', shape: 'cube', cx: 400, cy: 300, size: 100 },
      ],
    });
    expect(warnings.length).toBe(0);
    expect(normalized.elements.length).toBe(1);
    expect(normalized.elements[0]!.type).toBe('wireframe_3d');
  });

  it('rejects missing shape', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test',
      elements: [
        { id: 'w2', type: 'wireframe_3d', cx: 400, cy: 300, size: 100 },
      ],
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(normalized.elements.length).toBe(0);
  });

  it('rejects invalid shape value', () => {
    const { normalized, warnings } = normalizeDrawBatchPayload({
      batch_id: 'test',
      elements: [
        { id: 'w3', type: 'wireframe_3d', shape: 'pyramid', cx: 400, cy: 300, size: 100 },
      ],
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(normalized.elements.length).toBe(0);
  });

  it('preserves optional fields', () => {
    const { normalized } = normalizeDrawBatchPayload({
      batch_id: 'test',
      elements: [
        {
          id: 'w4',
          type: 'wireframe_3d',
          shape: 'surface',
          cx: 400,
          cy: 300,
          size: 100,
          rotationX: 45,
          rotationY: 60,
          expression: 'sin(x)*cos(y)',
          gridN: 6,
          strokeColor: '#ff0000',
          strokeWidth: 2,
          showHiddenLines: true,
        },
      ],
    });
    expect(normalized.elements.length).toBe(1);
    const el = normalized.elements[0] as Wireframe3dElement;
    expect(el.rotationX).toBe(45);
    expect(el.rotationY).toBe(60);
    expect(el.expression).toBe('sin(x)*cos(y)');
    expect(el.gridN).toBe(6);
    expect(el.strokeColor).toBe('#ff0000');
    expect(el.strokeWidth).toBe(2);
    expect(el.showHiddenLines).toBe(true);
  });
});
