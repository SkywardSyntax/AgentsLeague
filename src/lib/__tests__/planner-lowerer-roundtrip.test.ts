import { describe, it, expect } from 'vitest';
import { planSemanticBatch } from '@/lib/whiteboard/planner/templates';
import { lowerPlannedLayoutToDrawBatch } from '@/lib/whiteboard/planner/lowerer';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner/constraints';
import type { SemanticBatch, SemanticTemplate } from '@/types/agent';

function makeEquationBatch(overrides?: Partial<SemanticBatch>): SemanticBatch {
  return {
    batch_id: 'rt-eq-1',
    template: 'equation_derivation_vertical',
    blocks: [{
      id: 'eq1', kind: 'equation_stack',
      lines: [
        { id: 'l1', tex: 'E = mc^2', role: 'step' },
        { id: 'l2', tex: 'p = mv', role: 'result' },
      ],
    }],
    ...overrides,
  };
}

function makeDiagramBatch(): SemanticBatch {
  return {
    batch_id: 'rt-diag-1',
    template: 'jacobian_mapping_2panel',
    blocks: [{
      id: 'dp1', kind: 'diagram_panel',
      title: 'Mapping',
      axes: { x_label: 'x', y_label: 'y' },
      shapes: [{ id: 's1', type: 'rect', label: 'Region' }],
    }],
  };
}

function makeCaptionBatch(): SemanticBatch {
  return {
    batch_id: 'rt-cap-1',
    template: 'freeform_semantic',
    blocks: [{ id: 'cap1', kind: 'caption', text: 'Summary note' }],
  };
}

function roundTrip(semantic: SemanticBatch) {
  const planned = planSemanticBatch(semantic);
  const lowered = lowerPlannedLayoutToDrawBatch(planned);
  const constrained = enforceDrawBatchConstraints(lowered);
  return { planned, lowered, constrained };
}

describe('Planner↔Lowerer round-trip', () => {
  it('equation_stack block produces latex elements for each line', () => {
    const { constrained } = roundTrip(makeEquationBatch());
    const latexEls = constrained.batch.elements.filter((e) => e.type === 'latex');
    expect(latexEls.length).toBeGreaterThanOrEqual(2);
  });

  it('diagram_panel block produces axis arrows + shape elements', () => {
    const { constrained } = roundTrip(makeDiagramBatch());
    const arrows = constrained.batch.elements.filter((e) => e.type === 'arrow');
    const rects = constrained.batch.elements.filter((e) => e.type === 'rect');
    expect(arrows.length).toBeGreaterThanOrEqual(2); // x-axis + y-axis
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it('caption block produces text elements with caption content', () => {
    const { constrained } = roundTrip(makeCaptionBatch());
    const textEls = constrained.batch.elements.filter((e) => e.type === 'text');
    expect(textEls.length).toBeGreaterThanOrEqual(1);
    const hasCaption = textEls.some((e) => e.type === 'text' && e.text.includes('Summary'));
    expect(hasCaption).toBe(true);
  });

  it('mixed blocks all appear in lowered batch', () => {
    const mixed: SemanticBatch = {
      batch_id: 'rt-mixed-1',
      template: 'freeform_semantic',
      blocks: [
        { id: 'eq-m', kind: 'equation_stack', lines: [{ id: 'ml1', tex: 'a+b' }] },
        { id: 'dp-m', kind: 'diagram_panel', axes: { x_label: 'u', y_label: 'v' } },
        { id: 'cap-m', kind: 'caption', text: 'Note here' },
      ],
    };
    const { constrained } = roundTrip(mixed);
    expect(constrained.batch.elements.length).toBeGreaterThanOrEqual(3);
  });

  it('lowered batch_id matches the planner layout batchId', () => {
    const planned = planSemanticBatch(makeEquationBatch());
    const lowered = lowerPlannedLayoutToDrawBatch(planned);
    expect(lowered.batch_id).toBe(planned.batchId);
  });

  it('lowered batch style_preset matches planner output', () => {
    const planned = planSemanticBatch(makeEquationBatch({ style_preset: 'blueprint_neat' }));
    const lowered = lowerPlannedLayoutToDrawBatch(planned);
    expect(lowered.style_preset).toBe('blueprint_neat');
  });

  it('enforceDrawBatchConstraints returns no fallback for normal layout', () => {
    const { constrained } = roundTrip(makeEquationBatch());
    expect(constrained.fallbackUsed).toBe(false);
  });

  it('semantic relations produce arrow elements in lowered output', () => {
    const withRelation: SemanticBatch = {
      batch_id: 'rt-rel-1',
      template: 'jacobian_mapping_2panel',
      blocks: [
        { id: 'dp-a', kind: 'diagram_panel', title: 'A', axes: { x_label: 'x', y_label: 'y' } },
        { id: 'dp-b', kind: 'diagram_panel', title: 'B', axes: { x_label: 'u', y_label: 'v' } },
      ],
      relations: [{ id: 'r1', type: 'maps_to', from_block_id: 'dp-a', to_block_id: 'dp-b' }],
    };
    const { constrained } = roundTrip(withRelation);
    const arrows = constrained.batch.elements.filter((e) => e.type === 'arrow');
    expect(arrows.length).toBeGreaterThanOrEqual(1);
  });

  it('all three templates produce non-empty elements', () => {
    const templates: SemanticTemplate[] = [
      'equation_derivation_vertical',
      'jacobian_mapping_2panel',
      'freeform_semantic',
    ];
    for (const template of templates) {
      const semantic = makeEquationBatch({ template });
      const { constrained } = roundTrip(semantic);
      expect(constrained.batch.elements.length).toBeGreaterThan(0);
    }
  });

  it('all round-tripped elements have finite x/y coordinates', () => {
    const { constrained } = roundTrip(makeEquationBatch());
    for (const el of constrained.batch.elements) {
      if ('x' in el) expect(Number.isFinite(el.x)).toBe(true);
      if ('y' in el) expect(Number.isFinite(el.y)).toBe(true);
      if ('from' in el) {
        expect(Number.isFinite(el.from.x)).toBe(true);
        expect(Number.isFinite(el.from.y)).toBe(true);
      }
      if ('to' in el) {
        expect(Number.isFinite(el.to.x)).toBe(true);
        expect(Number.isFinite(el.to.y)).toBe(true);
      }
    }
  });
});
