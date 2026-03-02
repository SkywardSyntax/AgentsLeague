import { describe, expect, it } from 'vitest';
import {
  enforceDrawBatchConstraints,
  lowerPlannedLayoutToDrawBatch,
  planSemanticBatch,
  boundsOf,
  DEFAULT_MAX_LOWERED_ELEMENTS,
} from '@/lib/whiteboard/planner';
import type { PlannedSemanticLayout } from '@/lib/whiteboard/planner';
import type { DrawBatch, DrawElement, SemanticBatch } from '@/types/agent';

function makeLayout(elements: DrawElement[], warnings: string[] = []): PlannedSemanticLayout {
  return {
    batchId: 'int-batch',
    stylePreset: 'clean_pen_sketch',
    templateUsed: 'freeform_semantic',
    elements,
    anchors: [],
    warnings,
    semanticBatch: {
      batch_id: 'int-batch',
      template: 'freeform_semantic',
      blocks: [{ id: 'c1', kind: 'caption', text: 'hello' }],
    },
  };
}

describe('planner integration: constraints → lowerer pipeline', () => {
  it('overlap fix + arrow legibility + lowerer sort order', () => {
    const batch: DrawBatch = {
      batch_id: 'pipe-1',
      elements: [
        { id: 't1', type: 'text', x: 40, y: 100, text: 'first line', size: 22 },
        { id: 't2', type: 'text', x: 45, y: 102, text: 'second line', size: 22 },
        // Arrow shorter than 22px threshold
        { id: 'a1', type: 'arrow', from: { x: 300, y: 300 }, to: { x: 305, y: 303 } },
        { id: 'r1', type: 'rect', x: 500, y: 500, w: 80, h: 60 },
      ],
    };

    const constrained = enforceDrawBatchConstraints(batch);

    // Feed constrained batch into lowerer
    const layout = makeLayout(constrained.batch.elements);
    layout.batchId = constrained.batch.batch_id;
    const draw = lowerPlannedLayoutToDrawBatch(layout);

    // Arrow should be at least 22px after constraint fix (extended to 28px length)
    const arrow = draw.elements.find((el) => el.id === 'a1');
    expect(arrow).toBeDefined();
    expect(arrow!.type).toBe('arrow');
    if (arrow!.type === 'arrow') {
      const len = Math.hypot(arrow!.to.x - arrow!.from.x, arrow!.to.y - arrow!.from.y);
      expect(len).toBeGreaterThanOrEqual(22);
    }

    // Text elements should no longer overlap vertically
    const texts = draw.elements.filter((el) => el.type === 'text');
    expect(texts.length).toBe(2);
    if (texts[0]!.type === 'text' && texts[1]!.type === 'text') {
      expect(Math.abs(texts[0]!.y - texts[1]!.y)).toBeGreaterThan(8);
    }

    // Draw order: shapes (rect) → arrows → text
    const types = draw.elements.map((el) => el.type);
    const rectIdx = types.indexOf('rect');
    const arrowIdx = types.indexOf('arrow');
    const textIdx = types.indexOf('text');
    expect(rectIdx).toBeLessThan(arrowIdx);
    expect(arrowIdx).toBeLessThan(textIdx);
  });

  it('element count capped after constraints with insertion-order truncation', () => {
    const elements: DrawElement[] = Array.from({ length: 70 }, (_, i) => ({
      id: `t${i}`,
      type: 'text' as const,
      x: 40,
      y: 40 + i * 50,
      text: `item ${i}`,
      size: 14,
    }));

    const batch: DrawBatch = { batch_id: 'cap-test', elements };
    const constrained = enforceDrawBatchConstraints(batch);

    const layout = makeLayout(constrained.batch.elements);
    const draw = lowerPlannedLayoutToDrawBatch(layout);

    // Default cap is 60
    expect(draw.elements.length).toBeLessThanOrEqual(60);
    expect(layout.warnings).toContain('element_count_capped');
  });

  it('fallback reflow + lowerer produces non-overlapping sorted output', () => {
    // Force fallback by setting maxRepairIterations to 0
    const batch: DrawBatch = {
      batch_id: 'fallback-pipe',
      elements: [
        { id: 't1', type: 'text', x: 50, y: 100, text: 'overlapping text one', size: 18 },
        { id: 't2', type: 'text', x: 55, y: 101, text: 'overlapping text two', size: 18 },
        { id: 'r1', type: 'rect', x: 400, y: 400, w: 100, h: 80 },
      ],
    };

    const constrained = enforceDrawBatchConstraints(batch, { maxRepairIterations: 0 });
    expect(constrained.fallbackUsed).toBe(true);

    const layout = makeLayout(constrained.batch.elements);
    const draw = lowerPlannedLayoutToDrawBatch(layout);

    // All elements preserved
    expect(draw.elements.length).toBe(3);

    // Draw order maintained: rect before text
    const types = draw.elements.map((el) => el.type);
    expect(types.indexOf('rect')).toBeLessThan(types.indexOf('text'));
  });
});

describe('full pipeline: planSemanticBatch → constraints → lowerer', () => {
  it('equation_derivation_vertical with latex blocks produces valid layout', () => {
    const semanticBatch: SemanticBatch = {
      batch_id: 'eq-pipe-1',
      template: 'equation_derivation_vertical',
      intent: 'derive',
      blocks: [
        {
          id: 'eq-stack-1',
          kind: 'equation_stack',
          title: 'Derivation',
          lines: [
            { id: 'line-1', tex: '\\frac{d}{dx}\\int_a^x f(t)\\,dt = f(x)', displayMode: true, role: 'step' },
            { id: 'line-2', tex: 'F(x) = \\int_a^x f(t)\\,dt', displayMode: true, role: 'step' },
            { id: 'line-3', tex: "F'(x) = f(x)", displayMode: true, role: 'result' },
          ],
        },
        { id: 'cap-1', kind: 'caption', text: 'Fundamental Theorem of Calculus' },
      ],
    };

    const layout = planSemanticBatch(semanticBatch);
    const constrained = enforceDrawBatchConstraints({ batch_id: layout.batchId, elements: layout.elements });
    const draw = lowerPlannedLayoutToDrawBatch({
      ...layout,
      elements: constrained.batch.elements,
    });

    // All elements should have positive coordinates
    for (const el of draw.elements) {
      const b = boundsOf(el);
      expect(b).not.toBeNull();
      if (b) {
        expect(b.minX).toBeGreaterThanOrEqual(0);
        expect(b.minY).toBeGreaterThanOrEqual(0);
      }
    }

    // Latex elements should have valid tex strings
    const latexEls = draw.elements.filter((el) => el.type === 'latex');
    for (const el of latexEls) {
      if (el.type === 'latex') {
        expect(el.tex).toBeTruthy();
        expect(typeof el.tex).toBe('string');
      }
    }

    // All elements within default canvas bounds (1600×1200)
    for (const el of draw.elements) {
      const b = boundsOf(el);
      if (b) {
        expect(b.maxX).toBeLessThanOrEqual(1600);
        expect(b.maxY).toBeLessThanOrEqual(1200);
      }
    }

    // No empty_layout warning
    expect(layout.warnings).not.toContain('empty_layout');
  });

  it('jacobian_mapping_2panel with diagram + equations produces shapes→arrows→text order', () => {
    const semanticBatch: SemanticBatch = {
      batch_id: 'jac-pipe-1',
      template: 'jacobian_mapping_2panel',
      intent: 'teach',
      blocks: [
        {
          id: 'panel-left',
          kind: 'diagram_panel',
          region_hint: 'left',
          title: 'Input Space',
          shapes: [
            { id: 'rect-1', type: 'rect', label: 'x₁' },
            { id: 'rect-2', type: 'rect', label: 'x₂' },
          ],
        },
        {
          id: 'panel-right',
          kind: 'diagram_panel',
          region_hint: 'right',
          title: 'Output Space',
          shapes: [
            { id: 'rect-3', type: 'rect', label: 'y₁' },
          ],
        },
        {
          id: 'eq-block',
          kind: 'equation_stack',
          title: 'Jacobian',
          lines: [
            { id: 'jac-line', tex: 'J = \\begin{bmatrix} \\frac{\\partial y}{\\partial x_1} & \\frac{\\partial y}{\\partial x_2} \\end{bmatrix}', displayMode: true },
          ],
        },
        { id: 'note-cap', kind: 'caption', text: 'Linear approximation of mapping' },
      ],
      relations: [
        { id: 'rel-1', type: 'maps_to', from_block_id: 'panel-left', to_block_id: 'panel-right', label: 'J' },
      ],
    };

    const layout = planSemanticBatch(semanticBatch);
    const constrained = enforceDrawBatchConstraints({ batch_id: layout.batchId, elements: layout.elements });
    const draw = lowerPlannedLayoutToDrawBatch({
      ...layout,
      elements: constrained.batch.elements,
    });

    // All elements have positive coordinates and valid bounds
    for (const el of draw.elements) {
      const b = boundsOf(el);
      expect(b).not.toBeNull();
      if (b) {
        expect(b.minX).toBeGreaterThanOrEqual(0);
        expect(b.minY).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(b.minX)).toBe(false);
        expect(Number.isNaN(b.minY)).toBe(false);
      }
    }

    // No two text elements overlap vertically when they share horizontal space
    const textEls = draw.elements.filter((el) => el.type === 'text' || el.type === 'latex');
    for (let i = 0; i < textEls.length; i++) {
      for (let j = i + 1; j < textEls.length; j++) {
        const bA = boundsOf(textEls[i]!);
        const bB = boundsOf(textEls[j]!);
        if (!bA || !bB) continue;
        const xOverlap = Math.max(0, Math.min(bA.maxX, bB.maxX) - Math.max(bA.minX, bB.minX));
        if (xOverlap < 10) continue;
        const yOverlap = Math.min(bA.maxY, bB.maxY) - Math.max(bA.minY, bB.minY);
        // At minimum 14px clearance when horizontally overlapping
        if (yOverlap > 0) {
          expect(yOverlap).toBeLessThanOrEqual(0);
        }
      }
    }

    // Draw order: shapes/rects before arrows before text/latex
    const types = draw.elements.map((el) => el.type);
    const lastShapeIdx = Math.max(types.lastIndexOf('rect'), types.lastIndexOf('ellipse'));
    const firstTextIdx = types.findIndex((t) => t === 'text' || t === 'latex');
    if (lastShapeIdx >= 0 && firstTextIdx >= 0) {
      expect(lastShapeIdx).toBeLessThan(firstTextIdx);
    }
  });

  it('freeform_semantic with many blocks triggers element_count_capped', () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({
      id: `cap-block-${i}`,
      kind: 'equation_stack' as const,
      lines: Array.from({ length: 4 }, (_, j) => ({
        id: `cap-line-${i}-${j}`,
        tex: `x_{${i},${j}} = \\frac{${i + 1}}{${j + 1}}`,
        displayMode: true,
      })),
    }));

    const semanticBatch: SemanticBatch = {
      batch_id: 'cap-pipe-1',
      template: 'freeform_semantic',
      blocks,
    };

    const layout = planSemanticBatch(semanticBatch);
    const constrained = enforceDrawBatchConstraints({ batch_id: layout.batchId, elements: layout.elements });
    const draw = lowerPlannedLayoutToDrawBatch({
      ...layout,
      elements: constrained.batch.elements,
    });

    // Should be capped at or below the default max
    expect(draw.elements.length).toBeLessThanOrEqual(DEFAULT_MAX_LOWERED_ELEMENTS);

    // If enough elements were generated, warning should be present
    if (layout.elements.length > DEFAULT_MAX_LOWERED_ELEMENTS) {
      expect(layout.warnings).toContain('element_count_capped');
    }
  });

  it('handles elements with invalid geometry through the full pipeline', () => {
    const semanticBatch: SemanticBatch = {
      batch_id: 'invalid-pipe',
      template: 'freeform_semantic',
      blocks: [
        { id: 'cap-valid', kind: 'caption', text: 'Valid caption text' },
        {
          id: 'eq-valid',
          kind: 'equation_stack',
          lines: [{ id: 'eq-l1', tex: 'x = 1', displayMode: true }],
        },
      ],
    };

    const layout = planSemanticBatch(semanticBatch);

    // Inject an element with invalid geometry (w=0)
    layout.elements.push({ id: 'bad-rect', type: 'rect', x: 100, y: 100, w: 0, h: 50 });

    const constrained = enforceDrawBatchConstraints({ batch_id: layout.batchId, elements: layout.elements });
    const draw = lowerPlannedLayoutToDrawBatch({
      ...layout,
      elements: constrained.batch.elements,
    });

    // Invalid element should be dropped by lowerer
    const badEl = draw.elements.find((el) => el.id === 'bad-rect');
    expect(badEl).toBeUndefined();
    expect(layout.warnings).toContain('elements_dropped_invalid');

    // Remaining elements should all have valid bounds
    for (const el of draw.elements) {
      expect(boundsOf(el)).not.toBeNull();
    }
  });
});
