import { describe, expect, it } from 'vitest';
import { lowerPlannedLayoutToDrawBatch, DEFAULT_MAX_LOWERED_ELEMENTS, planSemanticBatch } from '@/lib/whiteboard/planner';
import type { PlannedSemanticLayout } from '@/lib/whiteboard/planner';
import type { DrawElement, SemanticBatch, PolygonElement, GeometricConstructionElement, AnnotationArrowElement, FormulaBoxElement, NumberLineElement, IntervalDiagramElement } from '@/types/agent';
import { DrawElementSchema } from '@/lib/schema';

function makeLayout(elements: DrawElement[], warnings: string[] = []): PlannedSemanticLayout {
  return {
    batchId: 'test-batch',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    warnings,
    semanticBatch: {
      batch_id: 'test-batch',
      template: 'freeform_semantic',
      blocks: [{ id: 'c1', kind: 'caption', text: 'hello' }],
    },
  };
}

describe('planner lowerer', () => {
  it('converts planned layout to draw batch preserving id/preset/elements', () => {
    const planned = makeLayout([{ id: 't1', type: 'text', x: 10, y: 20, text: 'hello' }]);
    planned.batchId = 'sem-batch';
    planned.stylePreset = 'clean_pen_sketch';

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.batch_id).toBe('sem-batch');
    expect(draw.style_preset).toBe('clean_pen_sketch');
    expect(draw.elements).toHaveLength(1);
  });

  it('deduplicates elements by id keeping last occurrence', () => {
    const planned = makeLayout([
      { id: 't1', type: 'text', x: 10, y: 20, text: 'first' },
      { id: 't1', type: 'text', x: 10, y: 30, text: 'second' },
    ]);

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements).toHaveLength(1);
    if (draw.elements[0]?.type === 'text') {
      expect(draw.elements[0].text).toBe('second');
    }
  });

  it('sorts elements by draw order: shapes → arrows → text', () => {
    const planned = makeLayout([
      { id: 't1', type: 'text', x: 10, y: 20, text: 'hello' },
      { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      { id: 'r1', type: 'rect', x: 100, y: 100, w: 50, h: 50 },
    ]);

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements[0]!.type).toBe('rect');
    expect(draw.elements[1]!.type).toBe('arrow');
    expect(draw.elements[2]!.type).toBe('text');
  });

  it('adds empty_layout warning when layout has 0 elements', () => {
    const planned = makeLayout([]);
    lowerPlannedLayoutToDrawBatch(planned);
    expect(planned.warnings).toContain('empty_layout');
  });

  it('caps elements at configurable limit and adds element_count_capped warning', () => {
    const elements: DrawElement[] = Array.from({ length: DEFAULT_MAX_LOWERED_ELEMENTS + 20 }, (_, i) => ({
      id: `t${i}`,
      type: 'text' as const,
      x: 10,
      y: 20 + i * 30,
      text: `item ${i}`,
    }));
    const planned = makeLayout(elements);

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements).toHaveLength(DEFAULT_MAX_LOWERED_ELEMENTS);
    expect(planned.warnings).toContain('element_count_capped');
  });

  it('accepts custom maxElements option', () => {
    const elements: DrawElement[] = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      type: 'text' as const,
      x: 10,
      y: 20 + i * 30,
      text: `item ${i}`,
    }));
    const planned = makeLayout(elements);

    const draw = lowerPlannedLayoutToDrawBatch(planned, { maxElements: 10 });
    expect(draw.elements).toHaveLength(10);
    expect(planned.warnings).toContain('element_count_capped');
  });

  it('returns empty warnings array for normal case (5 elements)', () => {
    const elements: DrawElement[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      type: 'text' as const,
      x: 10,
      y: 20 + i * 30,
      text: `item ${i}`,
    }));
    const planned = makeLayout([]);
    planned.elements = elements;
    planned.warnings = [];

    lowerPlannedLayoutToDrawBatch(planned);
    expect(planned.warnings).toHaveLength(0);
  });

  it('drops elements with NaN coordinates', () => {
    const elements: DrawElement[] = [
      { id: 't1', type: 'text', x: 10, y: 20, text: 'valid' },
      { id: 't2', type: 'text', x: NaN, y: 20, text: 'invalid' },
    ];
    const planned = makeLayout(elements);

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements).toHaveLength(1);
    expect(draw.elements[0]!.id).toBe('t1');
    expect(planned.warnings).toContain('elements_dropped_invalid');
  });

  it('drops text elements with size zero', () => {
    const elements: DrawElement[] = [
      { id: 't1', type: 'text', x: 10, y: 20, text: 'valid', size: 18 },
      { id: 't2', type: 'text', x: 10, y: 50, text: 'zero size', size: 0 },
    ];
    const planned = makeLayout(elements);

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements).toHaveLength(1);
    expect(draw.elements[0]!.id).toBe('t1');
    expect(planned.warnings).toContain('elements_dropped_invalid');
  });

  it('empty layout after all elements have invalid bounds', () => {
    const elements: DrawElement[] = [
      { id: 't1', type: 'text', x: NaN, y: 20, text: 'bad1' },
      { id: 't2', type: 'text', x: 10, y: Infinity, text: 'bad2' },
    ];
    const planned = makeLayout(elements);

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements).toHaveLength(0);
    expect(planned.warnings).toContain('elements_dropped_invalid');
    expect(planned.warnings).toContain('empty_layout');
  });

  it('deduplicates elements by id keeping last occurrence across types', () => {
    const elements: DrawElement[] = [
      { id: 'e1', type: 'rect', x: 10, y: 20, w: 50, h: 50 },
      { id: 'e1', type: 'text', x: 10, y: 30, text: 'replaced' },
    ];
    const planned = makeLayout(elements);

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements).toHaveLength(1);
    expect(draw.elements[0]!.type).toBe('text');
  });

  it('drawOrderPriority: clear element (unknown type) sorts last', () => {
    const elements: DrawElement[] = [
      { id: 'c1', type: 'clear' },
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 50, h: 50 },
      { id: 't1', type: 'text', x: 10, y: 200, text: 'hello' },
    ];
    const planned = makeLayout(elements);

    const draw = lowerPlannedLayoutToDrawBatch(planned);
    // clear has null bounds → dropped by validation
    // but if it survived, it would sort last (priority 3)
    // since clear has no coords, boundsOf returns null, so it gets filtered
    expect(draw.elements.some((el) => el.type === 'clear')).toBe(false);
    expect(planned.warnings).toContain('elements_dropped_invalid');
  });

  it('planSemanticBatch output is accepted by lowerPlannedLayoutToDrawBatch', () => {
    const semanticBatch: SemanticBatch = {
      batch_id: 'contract-1',
      template: 'equation_derivation_vertical',
      blocks: [
        { id: 'eq', kind: 'equation_stack', lines: [{ id: 'l1', tex: 'x^2=4' }] },
        { id: 'cap', kind: 'caption', text: 'Solve for x' },
      ],
    };
    const planned = planSemanticBatch(semanticBatch);
    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.batch_id).toBe('contract-1');
    expect(draw.elements.length).toBeGreaterThan(0);
    expect(draw.elements.every(e => 'id' in e && 'type' in e)).toBe(true);
  });

  // ── Polygon primitive tests ──────────────────────────────────────────

  it('polygon regular hexagon expands to 6 edges', () => {
    const hex: PolygonElement = {
      id: 'hex1',
      type: 'polygon',
      sides: 6,
      centerX: 400,
      centerY: 300,
      radius: 80,
    };
    const planned = makeLayout([hex]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);
    const edges = draw.elements.filter(e => e.type === 'line' && e.id.startsWith('hex1-edge'));
    expect(edges).toHaveLength(6);
  });

  it('polygon with vertices uses correct vertex count', () => {
    const quad: PolygonElement = {
      id: 'quad1',
      type: 'polygon',
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    };
    const planned = makeLayout([quad]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);
    const edges = draw.elements.filter(e => e.type === 'line' && e.id.startsWith('quad1-edge'));
    expect(edges).toHaveLength(4);
  });

  it('polygon with showAngles includes angle arcs', () => {
    const tri: PolygonElement = {
      id: 'tri1',
      type: 'polygon',
      vertices: [
        { x: 200, y: 100 },
        { x: 300, y: 300 },
        { x: 100, y: 300 },
      ],
      showAngles: true,
    };
    const planned = makeLayout([tri]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);
    const arcs = draw.elements.filter(e => e.id.startsWith('tri1-angle'));
    expect(arcs.length).toBeGreaterThan(0);
  });

  it('polygon schema validates regular polygon', () => {
    const valid = DrawElementSchema.safeParse({
      id: 'p-valid',
      type: 'polygon',
      sides: 5,
      centerX: 400,
      centerY: 300,
      radius: 80,
    });
    expect(valid.success).toBe(true);
  });

  it('polygon schema rejects < 3 vertices', () => {
    const invalid = DrawElementSchema.safeParse({
      id: 'p-bad',
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
    });
    expect(invalid.success).toBe(false);
  });

  // ── Geometric construction primitive tests ───────────────────────────

  it('geometric_construction circle + line expands with correct types', () => {
    const gc: GeometricConstructionElement = {
      id: 'gc1',
      type: 'geometric_construction',
      steps: [
        { type: 'circle', cx: 200, cy: 200, r: 50 },
        { type: 'line', x1: 100, y1: 200, x2: 300, y2: 200 },
      ],
    };
    const planned = makeLayout([gc]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);
    const hasCircle = draw.elements.some(e => e.type === 'ellipse' && e.id.includes('step0'));
    const hasLine = draw.elements.some(e => e.type === 'line' && e.id.includes('step1'));
    expect(hasCircle).toBe(true);
    expect(hasLine).toBe(true);
  });

  it('geometric_construction with point step renders dot and label', () => {
    const gc: GeometricConstructionElement = {
      id: 'gc2',
      type: 'geometric_construction',
      steps: [
        { type: 'point', x: 100, y: 100, label: 'A' },
      ],
    };
    const planned = makeLayout([gc]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);
    expect(draw.elements.some(e => e.type === 'ellipse')).toBe(true);
    expect(draw.elements.some(e => e.type === 'text')).toBe(true);
  });

  it('geometric_construction schema validates correctly', () => {
    const valid = DrawElementSchema.safeParse({
      id: 'gc-v',
      type: 'geometric_construction',
      steps: [
        { type: 'line', x1: 0, y1: 0, x2: 100, y2: 100 },
        { type: 'arc', cx: 50, cy: 50, r: 30, startAngle: 0, endAngle: 90, dashed: true },
      ],
    });
    expect(valid.success).toBe(true);

    const missing = DrawElementSchema.safeParse({
      id: 'gc-m',
      type: 'geometric_construction',
      // missing steps
    });
    expect(missing.success).toBe(false);
  });

  // --- interval_diagram tests ---

  it('interval_diagram with open/closed endpoints produces correct circles', () => {
    const el: IntervalDiagramElement = {
      id: 'iv1',
      type: 'interval_diagram',
      x: 50,
      y: 100,
      intervals: [
        { start: -2, end: 3, startOpen: false, endOpen: true },
      ],
    };
    const planned = makeLayout([el]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);

    // Should have at least one filled circle (closed start) and one open circle (open end)
    const circles = draw.elements.filter(e => e.type === 'ellipse');
    expect(circles.length).toBeGreaterThanOrEqual(2);

    const closedCircle = circles.find(e => e.type === 'ellipse' && 'fillColor' in e && e.fillColor);
    const openCircle = circles.find(e => e.type === 'ellipse' && !('fillColor' in e && e.fillColor));
    expect(closedCircle).toBeDefined();
    expect(openCircle).toBeDefined();
  });

  it('interval_diagram with infinity endpoint produces arrow', () => {
    const el: IntervalDiagramElement = {
      id: 'iv2',
      type: 'interval_diagram',
      x: 50,
      y: 100,
      intervals: [
        { start: 5, end: Infinity, startOpen: true },
      ],
    };
    const planned = makeLayout([el]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);

    // Should have an arrow element for the infinity direction
    const arrows = draw.elements.filter(e => e.type === 'arrow');
    expect(arrows.length).toBeGreaterThanOrEqual(1);
  });

  it('interval_diagram schema validates correctly', () => {
    const valid = DrawElementSchema.safeParse({
      id: 'iv-v',
      type: 'interval_diagram',
      x: 100,
      y: 200,
      intervals: [
        { start: -2, end: 3, endOpen: true },
        { start: 5, end: 1e308, startOpen: true },
      ],
      showNotation: true,
      title: 'Solution Set',
    });
    expect(valid.success).toBe(true);

    const missing = DrawElementSchema.safeParse({
      id: 'iv-m',
      type: 'interval_diagram',
      // missing intervals
    });
    expect(missing.success).toBe(false);
  });

  // --- number_line highlight color and region tests ---

  it('number_line highlights with color produce colored dots', () => {
    const el: NumberLineElement = {
      id: 'nl1',
      type: 'number_line',
      x: 50,
      y: 100,
      length: 300,
      min: 0,
      max: 10,
      highlights: [
        { value: 3, label: 'A', color: '#ff0000' },
        { value: 7, label: 'B' },
      ],
    };
    const planned = makeLayout([el]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);

    // Should have colored dot (ellipse with fillColor matching highlight color)
    const redDot = draw.elements.find(
      e => e.type === 'ellipse' && 'fillColor' in e && e.fillColor === '#ff0000',
    );
    expect(redDot).toBeDefined();

    // The label 'A' should be colored red
    const redLabel = draw.elements.find(
      e => e.type === 'text' && 'text' in e && (e as { text: string }).text === 'A' && e.color === '#ff0000',
    );
    expect(redLabel).toBeDefined();
  });

  it('number_line with region produces shaded rect', () => {
    const el: NumberLineElement = {
      id: 'nl2',
      type: 'number_line',
      x: 50,
      y: 100,
      length: 300,
      min: 0,
      max: 10,
      region: { start: 2, end: 8, color: 'rgba(255,0,0,0.2)' },
    };
    const planned = makeLayout([el]);
    const draw = lowerPlannedLayoutToDrawBatch(planned);

    // Should have a rect element for the region shading
    const regionRect = draw.elements.find(
      e => e.type === 'rect' && e.id.includes('region'),
    );
    expect(regionRect).toBeDefined();
    if (regionRect && regionRect.type === 'rect') {
      expect(regionRect.fillColor).toBe('rgba(255,0,0,0.2)');
    }
  });

  it('number_line with region and highlights schema validates', () => {
    const valid = DrawElementSchema.safeParse({
      id: 'nl-v',
      type: 'number_line',
      x: 50,
      y: 100,
      length: 300,
      min: 0,
      max: 10,
      highlights: [
        { value: 3, label: 'A', color: '#ff0000' },
      ],
      region: { start: 2, end: 8 },
    });
    expect(valid.success).toBe(true);
  });
});

// ── symbol_grid tests ─────────────────────────────────────────────────

describe('symbol_grid lowering', () => {
  it('expands a 3×3 symbol grid into rects and latex elements', () => {
    const el: DrawElement = {
      id: 'sg1',
      type: 'symbol_grid',
      x: 100,
      y: 100,
      symbols: [
        { latex: '\\alpha' },
        { latex: '\\beta' },
        { latex: '\\gamma' },
        { latex: '\\delta' },
        { latex: '\\epsilon' },
        { latex: '\\zeta' },
        { latex: '\\eta' },
        { latex: '\\theta' },
        { latex: '\\iota' },
      ],
      columns: 3,
    };
    const layout = makeLayout([el]);
    const result = lowerPlannedLayoutToDrawBatch(layout);
    // 9 rects + 9 latex = 18 minimum (no names by default when no name field)
    const rects = result.elements.filter(e => e.type === 'rect');
    const latexEls = result.elements.filter(e => e.type === 'latex');
    expect(rects.length).toBe(9);
    expect(latexEls.length).toBeGreaterThanOrEqual(9);
  });

  it('includes name text elements when symbols have names', () => {
    const el: DrawElement = {
      id: 'sg2',
      type: 'symbol_grid',
      x: 100,
      y: 100,
      symbols: [
        { latex: '\\alpha', name: 'alpha' },
        { latex: '\\beta', name: 'beta' },
      ],
      columns: 2,
    };
    const layout = makeLayout([el]);
    const result = lowerPlannedLayoutToDrawBatch(layout);
    const textEls = result.elements.filter(e => e.type === 'text');
    expect(textEls.length).toBeGreaterThanOrEqual(2);
  });

  it('suppresses name text when showNames is false', () => {
    const el: DrawElement = {
      id: 'sg3',
      type: 'symbol_grid',
      x: 100,
      y: 100,
      symbols: [
        { latex: '\\alpha', name: 'alpha' },
        { latex: '\\beta', name: 'beta' },
      ],
      columns: 2,
      showNames: false,
    };
    const layout = makeLayout([el]);
    const result = lowerPlannedLayoutToDrawBatch(layout);
    const textEls = result.elements.filter(e => e.type === 'text');
    // No name text elements (title text may still appear if set)
    expect(textEls.length).toBe(0);
  });

  it('renders title text when title is provided', () => {
    const el: DrawElement = {
      id: 'sg4',
      type: 'symbol_grid',
      x: 100,
      y: 100,
      symbols: [{ latex: '\\alpha' }],
      title: 'Greek Letters',
    };
    const layout = makeLayout([el]);
    const result = lowerPlannedLayoutToDrawBatch(layout);
    const textEls = result.elements.filter(e => e.type === 'text');
    const titleEl = textEls.find(e => e.type === 'text' && (e as { text: string }).text === 'Greek Letters');
    expect(titleEl).toBeDefined();
  });
});

// ── equation_system tests ─────────────────────────────────────────────

describe('equation_system lowering', () => {
  it('expands equation system with brace into a single latex element', () => {
    const el: DrawElement = {
      id: 'es1',
      type: 'equation_system',
      x: 200,
      y: 200,
      equations: ['2x + 3y = 7', 'x - y = 1'],
    };
    const layout = makeLayout([el]);
    const result = lowerPlannedLayoutToDrawBatch(layout);
    const latexEls = result.elements.filter(e => e.type === 'latex');
    // With brace (default), should produce one combined latex element
    expect(latexEls.length).toBeGreaterThanOrEqual(1);
    const combinedTex = (latexEls[0] as { tex: string }).tex;
    expect(combinedTex).toContain('\\left\\{');
    expect(combinedTex).toContain('\\begin{array}');
  });

  it('expands equation system without brace into individual latex elements', () => {
    const el: DrawElement = {
      id: 'es2',
      type: 'equation_system',
      x: 200,
      y: 200,
      equations: ['2x + 3y = 7', 'x - y = 1', '3x + 2y = 8'],
      showBrace: false,
    };
    const layout = makeLayout([el]);
    const result = lowerPlannedLayoutToDrawBatch(layout);
    const latexEls = result.elements.filter(e => e.type === 'latex');
    // Without brace, each equation is a separate latex element
    expect(latexEls.length).toBeGreaterThanOrEqual(3);
  });

  it('renders title text when title is provided', () => {
    const el: DrawElement = {
      id: 'es3',
      type: 'equation_system',
      x: 200,
      y: 200,
      equations: ['x = 1'],
      title: 'Solution',
    };
    const layout = makeLayout([el]);
    const result = lowerPlannedLayoutToDrawBatch(layout);
    const textEls = result.elements.filter(e => e.type === 'text');
    const titleEl = textEls.find(e => e.type === 'text' && (e as { text: string }).text === 'Solution');
    expect(titleEl).toBeDefined();
  });
});

// ── schema validation tests ───────────────────────────────────────────

describe('symbol_grid and equation_system schema validation', () => {
  it('validates a valid symbol_grid element', () => {
    const result = DrawElementSchema.safeParse({
      id: 'sg-v',
      type: 'symbol_grid',
      x: 100,
      y: 100,
      symbols: [{ latex: '\\alpha', name: 'alpha' }],
      columns: 3,
      cellWidth: 60,
      cellHeight: 50,
      title: 'Test',
      showNames: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects symbol_grid missing symbols', () => {
    const result = DrawElementSchema.safeParse({
      id: 'sg-bad',
      type: 'symbol_grid',
      x: 100,
      y: 100,
      // missing symbols
    });
    expect(result.success).toBe(false);
  });

  it('validates a valid equation_system element', () => {
    const result = DrawElementSchema.safeParse({
      id: 'es-v',
      type: 'equation_system',
      x: 100,
      y: 100,
      equations: ['x + y = 1'],
      showBrace: true,
      lineSpacing: 35,
      fontSize: 16,
      title: 'System',
    });
    expect(result.success).toBe(true);
  });

  it('rejects equation_system missing equations', () => {
    const result = DrawElementSchema.safeParse({
      id: 'es-bad',
      type: 'equation_system',
      x: 100,
      y: 100,
      // missing equations
    });
    expect(result.success).toBe(false);
  });

  // --- annotation_arrow tests ---

  it('expands annotation_arrow into line segments and text elements', () => {
    const elements: DrawElement[] = [
      {
        id: 'ann1',
        type: 'annotation_arrow',
        text: 'maximum',
        targetX: 400,
        targetY: 200,
        labelX: 500,
        labelY: 100,
        fontSize: 14,
      } as AnnotationArrowElement,
    ];
    const layout = makeLayout(elements);
    const batch = lowerPlannedLayoutToDrawBatch(layout);
    const types = batch.elements.map((e) => e.type);
    // Should produce line segments for the bezier curve + arrowhead lines + text label
    expect(types.filter((t) => t === 'line').length).toBeGreaterThanOrEqual(2);
    expect(types).toContain('text');
  });

  it('renders annotation_arrow text as latex when it contains LaTeX syntax', () => {
    const elements: DrawElement[] = [
      {
        id: 'ann2',
        type: 'annotation_arrow',
        text: 'f(x) = x^2',
        targetX: 300,
        targetY: 300,
        labelX: 450,
        labelY: 150,
      } as AnnotationArrowElement,
    ];
    const layout = makeLayout(elements);
    const batch = lowerPlannedLayoutToDrawBatch(layout);
    const types = batch.elements.map((e) => e.type);
    // Should use latex element since text contains ^
    expect(types).toContain('latex');
  });

  // --- formula_box tests ---

  it('expands formula_box into rect + latex elements', () => {
    const elements: DrawElement[] = [
      {
        id: 'fb1',
        type: 'formula_box',
        formula: '\\int_a^b f(x)\\,dx = F(b)-F(a)',
        x: 100,
        y: 100,
      } as FormulaBoxElement,
    ];
    const layout = makeLayout(elements);
    const batch = lowerPlannedLayoutToDrawBatch(layout);
    const types = batch.elements.map((e) => e.type);
    expect(types).toContain('rect');
    expect(types).toContain('latex');
  });

  it('includes title text when formula_box has a title', () => {
    const elements: DrawElement[] = [
      {
        id: 'fb2',
        type: 'formula_box',
        formula: 'E = mc^2',
        x: 200,
        y: 200,
        title: 'Mass-Energy Equivalence',
      } as FormulaBoxElement,
    ];
    const layout = makeLayout(elements);
    const batch = lowerPlannedLayoutToDrawBatch(layout);
    const types = batch.elements.map((e) => e.type);
    expect(types).toContain('rect');
    expect(types).toContain('latex');
    expect(types).toContain('text');
  });

  // --- schema validation tests ---

  it('validates annotation_arrow required fields', () => {
    const valid = DrawElementSchema.safeParse({
      id: 'ann-v',
      type: 'annotation_arrow',
      text: 'hello',
      targetX: 100,
      targetY: 200,
      labelX: 300,
      labelY: 100,
    });
    expect(valid.success).toBe(true);

    const invalid = DrawElementSchema.safeParse({
      id: 'ann-i',
      type: 'annotation_arrow',
      text: 'hello',
      // missing targetX, targetY, labelX, labelY
    });
    expect(invalid.success).toBe(false);
  });

  it('validates formula_box required fields', () => {
    const valid = DrawElementSchema.safeParse({
      id: 'fb-v',
      type: 'formula_box',
      formula: 'x^2 + y^2 = r^2',
      x: 100,
      y: 100,
    });
    expect(valid.success).toBe(true);

    const invalid = DrawElementSchema.safeParse({
      id: 'fb-i',
      type: 'formula_box',
      // missing formula, x, y
    });
    expect(invalid.success).toBe(false);
  });
});
