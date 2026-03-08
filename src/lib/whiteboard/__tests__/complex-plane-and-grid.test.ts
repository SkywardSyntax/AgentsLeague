import { describe, it, expect } from 'vitest';
import { lowerMathPrimitive } from '../planner/lowerer';
import type {
  ComplexPlaneElement,
  NumberTheoryGridElement,
  DrawElement,
} from '@/types/agent';
import { DrawBatchSchema } from '@/lib/schema';

// ---------------------------------------------------------------------------
// complex_plane tests
// ---------------------------------------------------------------------------
describe('expandComplexPlane', () => {
  function makePlane(overrides: Partial<ComplexPlaneElement> = {}): ComplexPlaneElement {
    return {
      id: 'cp1',
      type: 'complex_plane',
      ...overrides,
    };
  }

  it('with 2 points → 2 dot (ellipse) elements', () => {
    const el = makePlane({
      points: [
        { re: 1, im: 1, label: 'z1' },
        { re: -1, im: 0.5, label: 'z2' },
      ],
    });
    const out = lowerMathPrimitive(el);
    const dots = out.filter(
      (e) => e.type === 'ellipse' && e.id.includes('-pt-'),
    );
    expect(dots).toHaveLength(2);
  });

  it('with showUnitCircle → includes circle (ellipse) element', () => {
    const el = makePlane({ showUnitCircle: true });
    const out = lowerMathPrimitive(el);
    const circles = out.filter(
      (e) => e.type === 'ellipse' && e.id.includes('unit-circle'),
    );
    expect(circles.length).toBeGreaterThanOrEqual(1);
  });

  it('with 2 vectors → 2 arrow elements', () => {
    const el = makePlane({
      vectors: [
        { re: 1, im: 1, label: 'v1' },
        { re: 0, im: -1, label: 'v2' },
      ],
    });
    const out = lowerMathPrimitive(el);
    const arrows = out.filter(
      (e) => e.type === 'arrow' && e.id.includes('-vec-'),
    );
    expect(arrows).toHaveLength(2);
  });

  it('always produces Re/Im axis arrows', () => {
    const el = makePlane();
    const out = lowerMathPrimitive(el);
    const axes = out.filter((e) => e.type === 'arrow' && (e.id.includes('-re-axis') || e.id.includes('-im-axis')));
    expect(axes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// number_theory_grid tests
// ---------------------------------------------------------------------------
describe('expandNumberTheoryGrid', () => {
  function makeGrid(overrides: Partial<NumberTheoryGridElement> = {}): NumberTheoryGridElement {
    return {
      id: 'ntg1',
      type: 'number_theory_grid',
      n: 4,
      highlights: [],
      cx: 400,
      cy: 400,
      ...overrides,
    };
  }

  it('4×4 grid → 16 rect cells', () => {
    const el = makeGrid({ n: 4 });
    const out = lowerMathPrimitive(el);
    const rects = out.filter(
      (e) => e.type === 'rect' && e.id.includes('-cell-'),
    );
    expect(rects).toHaveLength(16);
  });

  it('with 3 highlights → 3 colored cells', () => {
    const el = makeGrid({
      n: 4,
      highlights: [
        { i: 0, j: 0, color: '#ff0000' },
        { i: 1, j: 2, color: '#00ff00' },
        { i: 3, j: 3, color: '#0000ff' },
      ],
    });
    const out = lowerMathPrimitive(el);
    const rects = out.filter(
      (e) => e.type === 'rect' && e.id.includes('-cell-'),
    ) as Array<Extract<DrawElement, { type: 'rect' }>>;
    expect(rects).toHaveLength(16);

    // Check highlighted cells got their custom colors
    const cell00 = rects.find((r) => r.id === 'ntg1-cell-0-0');
    expect(cell00?.color).toBe('#ff0000');
    const cell12 = rects.find((r) => r.id === 'ntg1-cell-1-2');
    expect(cell12?.color).toBe('#00ff00');
    const cell33 = rects.find((r) => r.id === 'ntg1-cell-3-3');
    expect(cell33?.color).toBe('#0000ff');
  });
});

// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------
describe('schema validation', () => {
  it('validates complex_plane element in a batch', () => {
    const batch = {
      batch_id: 'test-cp',
      elements: [
        {
          id: 'cp1',
          type: 'complex_plane',
          points: [{ re: 1, im: 1 }],
          showUnitCircle: true,
        },
      ],
    };
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('validates number_theory_grid element in a batch', () => {
    const batch = {
      batch_id: 'test-ntg',
      elements: [
        {
          id: 'ntg1',
          type: 'number_theory_grid',
          n: 5,
          highlights: [{ i: 0, j: 0, color: '#ff0000' }],
          cx: 400,
          cy: 400,
        },
      ],
    };
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });
});
