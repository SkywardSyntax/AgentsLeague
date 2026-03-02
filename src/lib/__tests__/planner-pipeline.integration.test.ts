import { describe, it, expect } from 'vitest';
import { normalizeSemanticBatchPayload, normalizeDrawBatchPayload } from '../schema';
import { planSemanticBatch, lowerPlannedLayoutToDrawBatch, enforceDrawBatchConstraints } from '../whiteboard/planner';
import type { SemanticBatch, DrawBatch } from '@/types/agent';

/**
 * Integration tests for the planner pipeline:
 * normalizeSemanticBatchPayload → planSemanticBatch → lowerPlannedLayoutToDrawBatch → enforceDrawBatchConstraints
 *
 * Validates end-to-end semantic batch processing produces valid, constraint-checked draw batches.
 */

describe('Planner Pipeline — End-to-End', () => {
  it('equation_stack through full pipeline produces valid draw batch', () => {
    const rawPayload = {
      batch_id: 'pipeline-eq-1',
      template: 'equation_derivation_vertical',
      style_preset: 'clean_pen_sketch',
      intent: 'derive',
      blocks: [
        {
          id: 'eq-block-1',
          kind: 'equation_stack',
          region_hint: 'left',
          title: 'Quadratic Formula',
          lines: [
            { id: 'line-1', tex: 'ax^2 + bx + c = 0', role: 'step' },
            { id: 'line-2', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', role: 'result' },
          ],
        },
      ],
    };

    // Step 1: Normalize
    const { normalized, warnings: normWarnings } = normalizeSemanticBatchPayload(rawPayload);
    expect(normalized).not.toBeNull();
    expect(normWarnings).toHaveLength(0);

    // Step 2: Plan
    const layout = planSemanticBatch(normalized as SemanticBatch);
    expect(layout.elements.length).toBeGreaterThan(0);
    expect(layout.templateUsed).toBe('equation_derivation_vertical');
    expect(layout.stylePreset).toBe('clean_pen_sketch');

    // Verify latex elements were generated
    const latexElements = layout.elements.filter((e) => e.type === 'latex');
    expect(latexElements.length).toBe(2);

    // Step 3: Lower to draw batch
    const drawBatch = lowerPlannedLayoutToDrawBatch(layout);
    expect(drawBatch.batch_id).toBe('pipeline-eq-1');
    expect(drawBatch.elements.length).toBe(layout.elements.length);

    // Step 4: Enforce constraints
    const { batch: finalBatch, violationsFixed, fallbackUsed } = enforceDrawBatchConstraints(drawBatch);
    expect(finalBatch.elements.length).toBeGreaterThan(0);
    // All elements should be within canvas bounds
    for (const el of finalBatch.elements) {
      if (el.type === 'rect') {
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('diagram_panel through full pipeline produces axes and shapes', () => {
    const rawPayload = {
      batch_id: 'pipeline-diag-1',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'panel-1',
          kind: 'diagram_panel',
          region_hint: 'center',
          title: 'Force Diagram',
          axes: { x_label: 'Distance', y_label: 'Force' },
          shapes: [
            { id: 'shape-1', type: 'rect', label: 'Object A', relative_pose: { x: 0.3, y: 0.4, w: 0.2, h: 0.2 } },
            { id: 'shape-2', type: 'arrow', relative_pose: { x: 0.6, y: 0.5, w: 0.3, h: 0.1 } },
          ],
          captions: [{ id: 'cap-1', text: 'Fig. 1: Forces', anchor: 'bottom' }],
        },
      ],
    };

    const { normalized } = normalizeSemanticBatchPayload(rawPayload);
    expect(normalized).not.toBeNull();

    const layout = planSemanticBatch(normalized as SemanticBatch);

    // Should have axes (arrows), shapes, title text, and captions
    const arrows = layout.elements.filter((e) => e.type === 'arrow');
    expect(arrows.length).toBeGreaterThanOrEqual(2); // at least x-axis and y-axis

    const textEls = layout.elements.filter((e) => e.type === 'text');
    expect(textEls.length).toBeGreaterThanOrEqual(1); // title + labels

    // Anchors should include axis origins
    const originAnchors = layout.anchors.filter((a) => a.role === 'axis_origin');
    expect(originAnchors.length).toBe(1);

    // Lower + constrain
    const drawBatch = lowerPlannedLayoutToDrawBatch(layout);
    const { batch: finalBatch } = enforceDrawBatchConstraints(drawBatch);
    expect(finalBatch.elements.length).toBeGreaterThan(0);
  });

  it('multi-block layout with relations produces inter-panel arrows', () => {
    const rawPayload = {
      batch_id: 'pipeline-multi-1',
      template: 'jacobian_mapping_2panel',
      intent: 'compare',
      blocks: [
        {
          id: 'left-panel',
          kind: 'diagram_panel',
          region_hint: 'left',
          title: 'Input Space',
          shapes: [{ id: 's1', type: 'rect', relative_pose: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 } }],
        },
        {
          id: 'right-panel',
          kind: 'diagram_panel',
          region_hint: 'right',
          title: 'Output Space',
          shapes: [{ id: 's2', type: 'rect', relative_pose: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 } }],
        },
        {
          id: 'caption-bottom',
          kind: 'caption',
          text: 'Jacobian maps input perturbations to output perturbations',
          region_hint: 'bottom',
        },
      ],
      relations: [
        {
          id: 'rel-1',
          type: 'maps_to',
          from_block_id: 'left-panel',
          to_block_id: 'right-panel',
          label: 'J',
        },
      ],
    };

    const { normalized, warnings } = normalizeSemanticBatchPayload(rawPayload);
    expect(normalized).not.toBeNull();

    const layout = planSemanticBatch(normalized as SemanticBatch);

    // Should contain the relation arrow
    const relationArrow = layout.elements.find((e) => e.id === 'rel-1');
    expect(relationArrow).toBeDefined();
    expect(relationArrow!.type).toBe('arrow');

    // Should have the relation label text
    const relationLabel = layout.elements.find((e) => e.id === 'rel-1-label');
    expect(relationLabel).toBeDefined();

    const drawBatch = lowerPlannedLayoutToDrawBatch(layout);
    const { batch: finalBatch } = enforceDrawBatchConstraints(drawBatch);
    expect(finalBatch.elements.length).toBeGreaterThanOrEqual(layout.elements.length);
  });

  it('normalization warnings propagate but do not break pipeline', () => {
    const rawPayload = {
      batch_id: 'pipeline-warn-1',
      template: 'invalid_template',
      blocks: [
        {
          id: 'eq-1',
          kind: 'equation_stack',
          lines: [
            { id: 'l1', tex: 'E = mc^2' },
            { tex: '' }, // invalid line — missing tex
          ],
        },
        { kind: 'unknown_kind' }, // invalid block
      ],
    };

    const { normalized, warnings } = normalizeSemanticBatchPayload(rawPayload);
    expect(normalized).not.toBeNull();
    expect(warnings.length).toBeGreaterThan(0);

    // Pipeline should still succeed with the valid parts
    const layout = planSemanticBatch(normalized as SemanticBatch);
    expect(layout.elements.length).toBeGreaterThan(0);

    const drawBatch = lowerPlannedLayoutToDrawBatch(layout);
    const { batch: finalBatch } = enforceDrawBatchConstraints(drawBatch);
    expect(finalBatch.elements.length).toBeGreaterThan(0);
  });

  it('constraint enforcement fixes out-of-bounds elements', () => {
    // Create a draw batch with elements placed far outside canvas
    const outOfBoundsBatch: DrawBatch = {
      batch_id: 'oob-test-1',
      elements: [
        { id: 'oob-1', type: 'rect', x: -200, y: -100, w: 100, h: 50 },
        { id: 'oob-2', type: 'text', x: 2000, y: 1500, text: 'Way out', size: 16 },
        { id: 'oob-3', type: 'arrow', from: { x: 10, y: 10 }, to: { x: 12, y: 12 } }, // too short
      ],
    };

    const { batch: fixedBatch, violationsFixed, fallbackUsed } = enforceDrawBatchConstraints(outOfBoundsBatch);

    expect(violationsFixed.length).toBeGreaterThan(0);
    // The short arrow should have been lengthened
    const arrow = fixedBatch.elements.find((e) => e.type === 'arrow');
    expect(arrow).toBeDefined();
    if (arrow && arrow.type === 'arrow') {
      const len = Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y);
      expect(len).toBeGreaterThanOrEqual(22);
    }
  });

  it('draw batch normalization handles malformed input gracefully', () => {
    const rawPayload = {
      batch_id: 'draw-norm-1',
      elements: [
        { id: 'ok-1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
        { type: 'rect' }, // missing coordinates
        { id: 'ok-2', type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 },
        'not an object', // invalid element
        { id: 'ok-3', type: 'text', x: 10, y: 10, text: 'Hello', size: 14 },
      ],
    };

    const { normalized, warnings } = normalizeDrawBatchPayload(rawPayload);
    expect(normalized).not.toBeNull();
    expect(normalized!.elements.length).toBe(3); // only valid elements
    expect(warnings.length).toBeGreaterThan(0);

    // Valid elements should be preserved correctly
    const rect = normalized!.elements.find((e) => e.id === 'ok-1');
    expect(rect).toBeDefined();
    expect(rect!.type).toBe('rect');
  });

  it('empty semantic batch is rejected', () => {
    const rawPayload = {
      batch_id: 'empty-1',
      template: 'freeform_semantic',
      blocks: [],
    };

    const { normalized, warnings } = normalizeSemanticBatchPayload(rawPayload);
    expect(normalized).toBeNull();
    expect(warnings).toContain('No valid semantic blocks in payload');
  });
});
