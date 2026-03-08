import { describe, expect, it } from 'vitest';
import { lowerPlannedLayoutToDrawBatch, DEFAULT_MAX_LOWERED_ELEMENTS, planSemanticBatch } from '@/lib/whiteboard/planner';
import type { PlannedSemanticLayout } from '@/lib/whiteboard/planner';
import type { DrawElement, SemanticBatch } from '@/types/agent';

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
});
