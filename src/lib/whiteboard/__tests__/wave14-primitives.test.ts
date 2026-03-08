import { describe, it, expect } from 'vitest';
import { lowerMathPrimitive } from '../planner/lowerer';
import type {
  AnnotationArrowElement,
  FormulaBoxElement,
  SymbolGridElement,
  EquationSystemElement,
  GeometricConstructionElement,
  IntervalDiagramElement,
} from '@/types/agent';

// ---------------------------------------------------------------------------
// annotation_arrow tests
// ---------------------------------------------------------------------------
describe('expandAnnotationArrow (via lowerMathPrimitive)', () => {
  function makeArrow(overrides: Partial<AnnotationArrowElement> = {}): AnnotationArrowElement {
    return {
      id: 'aa1',
      type: 'annotation_arrow',
      text: 'local max',
      targetX: 300,
      targetY: 200,
      labelX: 400,
      labelY: 150,
      ...overrides,
    };
  }

  it('expands to >0 basic elements', () => {
    const out = lowerMathPrimitive(makeArrow() as Parameters<typeof lowerMathPrimitive>[0]);
    expect(out.length).toBeGreaterThan(0);
  });

  it('all output coordinates are finite', () => {
    const out = lowerMathPrimitive(makeArrow() as Parameters<typeof lowerMathPrimitive>[0]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
  });

  it('produces at least 1 text or latex label element', () => {
    const out = lowerMathPrimitive(makeArrow() as Parameters<typeof lowerMathPrimitive>[0]);
    const labels = out.filter((e) => e.type === 'text' || e.type === 'latex');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('produces bezier curve line segments (STEPS=20 → 20 segments)', () => {
    const out = lowerMathPrimitive(makeArrow() as Parameters<typeof lowerMathPrimitive>[0]);
    // 20 segments + 2 arrowhead lines
    const lines = out.filter((e) => e.type === 'line');
    expect(lines.length).toBe(22);
  });

  it('isLatex=true uses latex element for label', () => {
    const out = lowerMathPrimitive(
      makeArrow({ text: '\\frac{d}{dx}', isLatex: true }) as Parameters<typeof lowerMathPrimitive>[0],
    );
    const latexLabel = out.find((e) => e.type === 'latex' && e.id === 'aa1-label');
    expect(latexLabel).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// formula_box tests
// ---------------------------------------------------------------------------
describe('expandFormulaBox (via lowerMathPrimitive)', () => {
  function makeBox(overrides: Partial<FormulaBoxElement> = {}): FormulaBoxElement {
    return {
      id: 'fb1',
      type: 'formula_box',
      formula: 'E = mc^2',
      x: 100,
      y: 100,
      ...overrides,
    };
  }

  it('expands to >0 basic elements', () => {
    const out = lowerMathPrimitive(makeBox() as Parameters<typeof lowerMathPrimitive>[0]);
    expect(out.length).toBeGreaterThan(0);
  });

  it('all output coordinates are finite', () => {
    const out = lowerMathPrimitive(makeBox() as Parameters<typeof lowerMathPrimitive>[0]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
  });

  it('produces exactly 1 rect border box + 1 latex formula element', () => {
    const out = lowerMathPrimitive(makeBox() as Parameters<typeof lowerMathPrimitive>[0]);
    expect(out.filter((e) => e.type === 'rect')).toHaveLength(1);
    const latexEl = out.find((e) => e.type === 'latex' && e.id === 'fb1-formula');
    expect(latexEl).toBeDefined();
  });

  it('with title adds a text element for the title', () => {
    const out = lowerMathPrimitive(
      makeBox({ title: 'Energy' }) as Parameters<typeof lowerMathPrimitive>[0],
    );
    const title = out.find((e) => e.type === 'text' && e.id === 'fb1-title');
    expect(title).toBeDefined();
  });

  it('without title produces exactly 2 elements', () => {
    const out = lowerMathPrimitive(makeBox() as Parameters<typeof lowerMathPrimitive>[0]);
    expect(out).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// symbol_grid tests
// ---------------------------------------------------------------------------
describe('expandSymbolGrid (via lowerMathPrimitive)', () => {
  function makeGrid(overrides: Partial<SymbolGridElement> = {}): SymbolGridElement {
    return {
      id: 'sg1',
      type: 'symbol_grid',
      symbols: [
        { latex: '\\alpha', name: 'alpha' },
        { latex: '\\beta', name: 'beta' },
        { latex: '\\gamma', name: 'gamma' },
      ],
      x: 50,
      y: 50,
      ...overrides,
    };
  }

  it('expands to >0 basic elements', () => {
    const out = lowerMathPrimitive(makeGrid() as Parameters<typeof lowerMathPrimitive>[0]);
    expect(out.length).toBeGreaterThan(0);
  });

  it('all output coordinates are finite', () => {
    const out = lowerMathPrimitive(makeGrid() as Parameters<typeof lowerMathPrimitive>[0]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
  });

  it('produces one latex element per symbol', () => {
    const out = lowerMathPrimitive(makeGrid() as Parameters<typeof lowerMathPrimitive>[0]);
    const latexEls = out.filter((e) => e.type === 'latex');
    expect(latexEls).toHaveLength(3);
  });

  it('produces one rect cell border per symbol', () => {
    const out = lowerMathPrimitive(makeGrid() as Parameters<typeof lowerMathPrimitive>[0]);
    const rects = out.filter((e) => e.type === 'rect');
    expect(rects).toHaveLength(3);
  });

  it('with title adds title text element', () => {
    const out = lowerMathPrimitive(
      makeGrid({ title: 'Greek Letters' }) as Parameters<typeof lowerMathPrimitive>[0],
    );
    const title = out.find((e) => e.type === 'text' && e.id === 'sg1-title');
    expect(title).toBeDefined();
  });

  it('showNames=false suppresses name labels', () => {
    const out = lowerMathPrimitive(
      makeGrid({ showNames: false }) as Parameters<typeof lowerMathPrimitive>[0],
    );
    const nameEls = out.filter((e) => e.id.startsWith('sg1-name-'));
    expect(nameEls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// equation_system tests
// ---------------------------------------------------------------------------
describe('expandEquationSystem (via lowerMathPrimitive)', () => {
  function makeSystem(overrides: Partial<EquationSystemElement> = {}): EquationSystemElement {
    return {
      id: 'es1',
      type: 'equation_system',
      equations: [
        'x + y = 5',
        '2x - y = 1',
      ],
      x: 100,
      y: 100,
      ...overrides,
    };
  }

  it('expands to >0 basic elements', () => {
    const out = lowerMathPrimitive(makeSystem() as Parameters<typeof lowerMathPrimitive>[0]);
    expect(out.length).toBeGreaterThan(0);
  });

  it('all output coordinates are finite', () => {
    const out = lowerMathPrimitive(makeSystem() as Parameters<typeof lowerMathPrimitive>[0]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
  });

  it('showBrace=true (default) produces single combined latex element', () => {
    const out = lowerMathPrimitive(makeSystem() as Parameters<typeof lowerMathPrimitive>[0]);
    const systemEl = out.find((e) => e.type === 'latex' && e.id === 'es1-system');
    expect(systemEl).toBeDefined();
  });

  it('showBrace=false produces one latex element per equation', () => {
    const out = lowerMathPrimitive(
      makeSystem({ showBrace: false }) as Parameters<typeof lowerMathPrimitive>[0],
    );
    const eqEls = out.filter((e) => e.type === 'latex' && e.id.startsWith('es1-eq-'));
    expect(eqEls).toHaveLength(2);
  });

  it('with title adds title text element', () => {
    const out = lowerMathPrimitive(
      makeSystem({ title: 'Linear System' }) as Parameters<typeof lowerMathPrimitive>[0],
    );
    const title = out.find((e) => e.type === 'text' && e.id === 'es1-title');
    expect(title).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// geometric_construction tests
// ---------------------------------------------------------------------------
describe('expandGeometricConstruction (via lowerMathPrimitive)', () => {
  function makeConstruction(
    overrides: Partial<GeometricConstructionElement> = {},
  ): GeometricConstructionElement {
    return {
      id: 'gc1',
      type: 'geometric_construction',
      steps: [
        { type: 'point', x: 200, y: 200, label: 'A' },
        { type: 'point', x: 300, y: 200, label: 'B' },
        { type: 'line', x1: 200, y1: 200, x2: 300, y2: 200 },
        { type: 'circle', cx: 250, cy: 200, r: 60 },
      ],
      ...overrides,
    };
  }

  it('expands to >0 basic elements', () => {
    const out = lowerMathPrimitive(makeConstruction() as Parameters<typeof lowerMathPrimitive>[0]);
    expect(out.length).toBeGreaterThan(0);
  });

  it('all output coordinates are finite', () => {
    const out = lowerMathPrimitive(makeConstruction() as Parameters<typeof lowerMathPrimitive>[0]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
  });

  it('point step with label produces ellipse dot + text label', () => {
    const out = lowerMathPrimitive(makeConstruction() as Parameters<typeof lowerMathPrimitive>[0]);
    const dotA = out.find((e) => e.type === 'ellipse' && e.id === 'gc1-step0-dot');
    expect(dotA).toBeDefined();
    const labelA = out.find((e) => e.type === 'text' && e.id === 'gc1-step0-label');
    expect(labelA).toBeDefined();
  });

  it('line step produces a line element', () => {
    const out = lowerMathPrimitive(makeConstruction() as Parameters<typeof lowerMathPrimitive>[0]);
    const lineEl = out.find((e) => e.type === 'line' && e.id === 'gc1-step2');
    expect(lineEl).toBeDefined();
  });

  it('circle step produces an ellipse element', () => {
    const out = lowerMathPrimitive(makeConstruction() as Parameters<typeof lowerMathPrimitive>[0]);
    const circleEl = out.find((e) => e.type === 'ellipse' && e.id === 'gc1-step3');
    expect(circleEl).toBeDefined();
  });

  it('with title adds title text element', () => {
    const out = lowerMathPrimitive(
      makeConstruction({ title: 'Triangle Construction' }) as Parameters<typeof lowerMathPrimitive>[0],
    );
    const title = out.find((e) => e.type === 'text' && e.id === 'gc1-title');
    expect(title).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// interval_diagram tests
// ---------------------------------------------------------------------------
describe('expandIntervalDiagram (via lowerMathPrimitive)', () => {
  function makeDiagram(overrides: Partial<IntervalDiagramElement> = {}): IntervalDiagramElement {
    return {
      id: 'id1',
      type: 'interval_diagram',
      intervals: [
        { start: 1, end: 4 },
        { start: -2, end: 2, startOpen: true, endOpen: true },
      ],
      x: 100,
      y: 200,
      ...overrides,
    };
  }

  it('expands to >0 basic elements', () => {
    const out = lowerMathPrimitive(makeDiagram() as Parameters<typeof lowerMathPrimitive>[0]);
    expect(out.length).toBeGreaterThan(0);
  });

  it('all output coordinates are finite', () => {
    const out = lowerMathPrimitive(makeDiagram() as Parameters<typeof lowerMathPrimitive>[0]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
  });

  it('produces an axis arrow element', () => {
    const out = lowerMathPrimitive(makeDiagram() as Parameters<typeof lowerMathPrimitive>[0]);
    const axis = out.find((e) => e.type === 'arrow' && e.id === 'id1-axis');
    expect(axis).toBeDefined();
  });

  it('produces one thick segment line per interval', () => {
    const out = lowerMathPrimitive(makeDiagram() as Parameters<typeof lowerMathPrimitive>[0]);
    const seg0 = out.find((e) => e.type === 'line' && e.id === 'id1-seg-0');
    const seg1 = out.find((e) => e.type === 'line' && e.id === 'id1-seg-1');
    expect(seg0).toBeDefined();
    expect(seg1).toBeDefined();
  });

  it('closed endpoints produce filled ellipse markers', () => {
    const out = lowerMathPrimitive(makeDiagram() as Parameters<typeof lowerMathPrimitive>[0]);
    // Interval 0 has closed start and end
    const epStart = out.find((e) => e.type === 'ellipse' && e.id === 'id1-ep-s-0');
    const epEnd = out.find((e) => e.type === 'ellipse' && e.id === 'id1-ep-e-0');
    expect(epStart).toBeDefined();
    expect(epEnd).toBeDefined();
  });

  it('empty intervals array returns empty output', () => {
    const out = lowerMathPrimitive(
      makeDiagram({ intervals: [] }) as Parameters<typeof lowerMathPrimitive>[0],
    );
    expect(out).toHaveLength(0);
  });
});
