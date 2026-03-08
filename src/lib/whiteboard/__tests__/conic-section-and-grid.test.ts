import { describe, it, expect } from 'vitest';
import { lowerMathPrimitive } from '../planner/lowerer';
import type {
  ConicSectionElement,
  CoordinateGridElement,
  DrawElement,
} from '@/types/agent';
import { DrawBatchSchema } from '@/lib/schema';

// ---------------------------------------------------------------------------
// conic_section tests
// ---------------------------------------------------------------------------
describe('expandConicSection', () => {
  function makeConic(overrides: Partial<ConicSectionElement> = {}): ConicSectionElement {
    return {
      id: 'cs1',
      type: 'conic_section',
      conicType: 'ellipse',
      cx: 0,
      cy: 0,
      x: 400,
      y: 300,
      ...overrides,
    };
  }

  // --- Ellipse ---
  it('ellipse → parametric curve (200 line segments)', () => {
    const el = makeConic({ conicType: 'ellipse', a: 100, b: 60 });
    const out = lowerMathPrimitive(el);
    const lines = out.filter((e) => e.type === 'line');
    expect(lines.length).toBe(200);
  });

  it('ellipse → foci markers by default', () => {
    const el = makeConic({ conicType: 'ellipse', a: 100, b: 60 });
    const out = lowerMathPrimitive(el);
    const foci = out.filter(
      (e) => e.type === 'ellipse' && e.id.includes('-focus-'),
    );
    expect(foci).toHaveLength(2);
  });

  it('ellipse → vertex markers by default', () => {
    const el = makeConic({ conicType: 'ellipse', a: 100, b: 60 });
    const out = lowerMathPrimitive(el);
    const verts = out.filter(
      (e) => e.type === 'ellipse' && e.id.includes('-vertex-'),
    );
    expect(verts).toHaveLength(2);
  });

  it('ellipse showFoci=false → no foci markers', () => {
    const el = makeConic({ conicType: 'ellipse', showFoci: false });
    const out = lowerMathPrimitive(el);
    const foci = out.filter(
      (e) => e.id.includes('-focus-'),
    );
    expect(foci).toHaveLength(0);
  });

  it('ellipse → equation latex element', () => {
    const el = makeConic({ conicType: 'ellipse', a: 100, b: 60 });
    const out = lowerMathPrimitive(el);
    const latex = out.filter((e) => e.type === 'latex' && e.id.includes('-equation'));
    expect(latex).toHaveLength(1);
  });

  it('ellipse all coordinates are finite', () => {
    const el = makeConic({ conicType: 'ellipse', a: 100, b: 60 });
    const out = lowerMathPrimitive(el);
    const lines = out.filter((e) => e.type === 'line') as Array<Extract<DrawElement, { type: 'line' }>>;
    for (const line of lines) {
      expect(Number.isFinite(line.from.x)).toBe(true);
      expect(Number.isFinite(line.from.y)).toBe(true);
      expect(Number.isFinite(line.to.x)).toBe(true);
      expect(Number.isFinite(line.to.y)).toBe(true);
    }
  });

  // --- Hyperbola ---
  it('hyperbola → two branches (2×200 line segments)', () => {
    const el = makeConic({ conicType: 'hyperbola', a: 80, b: 50 });
    const out = lowerMathPrimitive(el);
    const rightBranch = out.filter((e) => e.type === 'line' && e.id.includes('-right-'));
    const leftBranch = out.filter((e) => e.type === 'line' && e.id.includes('-left-'));
    expect(rightBranch).toHaveLength(200);
    expect(leftBranch).toHaveLength(200);
  });

  it('hyperbola → asymptote lines by default', () => {
    const el = makeConic({ conicType: 'hyperbola', a: 80, b: 50 });
    const out = lowerMathPrimitive(el);
    const asymptotes = out.filter(
      (e) => e.type === 'line' && e.id.includes('-asym-'),
    );
    expect(asymptotes).toHaveLength(2);
  });

  it('hyperbola showAsymptotes=false → no asymptote lines', () => {
    const el = makeConic({ conicType: 'hyperbola', showAsymptotes: false });
    const out = lowerMathPrimitive(el);
    const asymptotes = out.filter((e) => e.id.includes('-asym-'));
    expect(asymptotes).toHaveLength(0);
  });

  it('hyperbola → foci at (±c, 0)', () => {
    const el = makeConic({ conicType: 'hyperbola', a: 80, b: 50 });
    const out = lowerMathPrimitive(el);
    const foci = out.filter(
      (e) => e.type === 'ellipse' && e.id.includes('-focus-'),
    );
    expect(foci).toHaveLength(2);
  });

  it('hyperbola → equation latex', () => {
    const el = makeConic({ conicType: 'hyperbola', a: 80, b: 50 });
    const out = lowerMathPrimitive(el);
    const latex = out.filter(
      (e) => e.type === 'latex' && e.id.includes('-equation'),
    ) as Array<Extract<DrawElement, { type: 'latex' }>>;
    expect(latex).toHaveLength(1);
    expect(latex[0]!.tex).toContain('-');
  });

  // --- Parabola ---
  it('parabola → parametric curve (200 segments)', () => {
    const el = makeConic({ conicType: 'parabola', p: 40 });
    const out = lowerMathPrimitive(el);
    const segs = out.filter((e) => e.type === 'line' && e.id.includes('-seg-'));
    expect(segs).toHaveLength(200);
  });

  it('parabola → focus + directrix by default', () => {
    const el = makeConic({ conicType: 'parabola', p: 40 });
    const out = lowerMathPrimitive(el);
    const focus = out.filter((e) => e.type === 'ellipse' && e.id.includes('-focus'));
    expect(focus).toHaveLength(1);
    const directrix = out.filter((e) => e.type === 'line' && e.id.includes('-directrix'));
    expect(directrix).toHaveLength(1);
  });

  it('parabola showDirectrix=false → no directrix', () => {
    const el = makeConic({ conicType: 'parabola', showDirectrix: false });
    const out = lowerMathPrimitive(el);
    const directrix = out.filter((e) => e.id.includes('-directrix'));
    expect(directrix).toHaveLength(0);
  });

  it('parabola horizontal=true → opens right', () => {
    const el = makeConic({ conicType: 'parabola', p: 40, horizontal: true });
    const out = lowerMathPrimitive(el);
    // Focus should be to the right of center
    const focus = out.filter(
      (e) => e.type === 'ellipse' && e.id.includes('-focus'),
    ) as Array<Extract<DrawElement, { type: 'ellipse' }>>;
    expect(focus).toHaveLength(1);
    expect(focus[0]!.cx).toBeGreaterThan(el.x);
  });

  it('adds label when provided', () => {
    const el = makeConic({ label: 'My Conic' });
    const out = lowerMathPrimitive(el);
    const labels = out.filter((e) => e.type === 'text' && e.id === 'cs1-label');
    expect(labels).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// coordinate_grid tests
// ---------------------------------------------------------------------------
describe('expandCoordinateGrid', () => {
  function makeGrid(overrides: Partial<CoordinateGridElement> = {}): CoordinateGridElement {
    return {
      id: 'cg1',
      type: 'coordinate_grid',
      x: 100,
      y: 100,
      ...overrides,
    };
  }

  it('default grid → minor + major line strokes', () => {
    const el = makeGrid();
    const out = lowerMathPrimitive(el);
    const minorLines = out.filter((e) => e.type === 'line' && e.id.includes('-minor-'));
    const majorLines = out.filter((e) => e.type === 'line' && e.id.includes('-major-'));
    expect(minorLines.length).toBeGreaterThan(0);
    expect(majorLines.length).toBeGreaterThan(0);
  });

  it('minor lines drawn before major lines in output order', () => {
    const el = makeGrid();
    const out = lowerMathPrimitive(el);
    const firstMinor = out.findIndex((e) => e.id.includes('-minor-'));
    const firstMajor = out.findIndex((e) => e.id.includes('-major-'));
    expect(firstMinor).toBeLessThan(firstMajor);
  });

  it('showAxes=true (default) → bold axis lines', () => {
    const el = makeGrid({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 });
    const out = lowerMathPrimitive(el);
    const axes = out.filter(
      (e) => e.type === 'line' && (e.id.includes('-x-axis') || e.id.includes('-y-axis')),
    );
    expect(axes.length).toBeGreaterThanOrEqual(1);
  });

  it('showAxes=false → no axis lines', () => {
    const el = makeGrid({ showAxes: false });
    const out = lowerMathPrimitive(el);
    const axes = out.filter(
      (e) => e.id.includes('-x-axis') || e.id.includes('-y-axis'),
    );
    expect(axes).toHaveLength(0);
  });

  it('showLabels=true (default) → label text elements', () => {
    const el = makeGrid();
    const out = lowerMathPrimitive(el);
    const labels = out.filter((e) => e.type === 'text');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('showLabels=false → no label text', () => {
    const el = makeGrid({ showLabels: false });
    const out = lowerMathPrimitive(el);
    const labels = out.filter((e) => e.type === 'text');
    expect(labels).toHaveLength(0);
  });

  it('custom spacing → correct number of lines', () => {
    const el = makeGrid({ width: 200, height: 200, majorSpacing: 100, minorSpacing: 50 });
    const out = lowerMathPrimitive(el);
    const majorV = out.filter((e) => e.id.includes('-major-v-'));
    const majorH = out.filter((e) => e.id.includes('-major-h-'));
    // 200/100 + 1 = 3 lines each direction
    expect(majorV).toHaveLength(3);
    expect(majorH).toHaveLength(3);
  });

  it('all coordinates are finite', () => {
    const el = makeGrid();
    const out = lowerMathPrimitive(el);
    const lines = out.filter((e) => e.type === 'line') as Array<Extract<DrawElement, { type: 'line' }>>;
    for (const line of lines) {
      expect(Number.isFinite(line.from.x)).toBe(true);
      expect(Number.isFinite(line.from.y)).toBe(true);
      expect(Number.isFinite(line.to.x)).toBe(true);
      expect(Number.isFinite(line.to.y)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------
describe('schema validation', () => {
  it('validates conic_section element in a batch', () => {
    const batch = {
      batch_id: 'test-cs',
      elements: [
        {
          id: 'cs1',
          type: 'conic_section',
          conicType: 'ellipse',
          cx: 0,
          cy: 0,
          x: 400,
          y: 300,
          a: 100,
          b: 60,
        },
      ],
    };
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('validates coordinate_grid element in a batch', () => {
    const batch = {
      batch_id: 'test-cg',
      elements: [
        {
          id: 'cg1',
          type: 'coordinate_grid',
          x: 100,
          y: 100,
          width: 600,
          height: 400,
          majorSpacing: 50,
          minorSpacing: 10,
        },
      ],
    };
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(true);
  });

  it('rejects invalid conicType', () => {
    const batch = {
      batch_id: 'test-bad',
      elements: [
        {
          id: 'cs-bad',
          type: 'conic_section',
          conicType: 'circle',
          cx: 0,
          cy: 0,
          x: 400,
          y: 300,
        },
      ],
    };
    const result = DrawBatchSchema.safeParse(batch);
    expect(result.success).toBe(false);
  });
});
