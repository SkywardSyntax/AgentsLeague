import { describe, it, expect } from 'vitest';
import { normalizeSemanticBatchPayload, SemanticBatchSchema } from '../schema';

describe('normalizeSemanticBatchPayload → SemanticBatchSchema contract', () => {
  it('minimal valid caption block normalizes and passes schema', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b',
      template: 'freeform_semantic',
      blocks: [{ id: 'c1', kind: 'caption', text: 'hello' }],
    });
    expect(normalized).not.toBeNull();
    const result = SemanticBatchSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });

  it('equation stack with one line normalizes and passes schema', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'b',
      template: 'equation_derivation_vertical',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'x^2' }],
        },
      ],
    });
    expect(normalized).not.toBeNull();
    expect(SemanticBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('diagram panel with shapes and captions normalizes and passes schema', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'b',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'dp1',
          kind: 'diagram_panel',
          title: 'My Diagram',
          axes: { x_label: 'Time', y_label: 'Value' },
          shapes: [
            { id: 's1', type: 'rect', label: 'Box A', relative_pose: { x: 0.2, y: 0.3, w: 0.4, h: 0.3 } },
            { id: 's2', type: 'arrow', label: 'Flow' },
          ],
          captions: [{ id: 'cap1', text: 'Figure 1', anchor: 'bottom' }],
        },
      ],
    });
    expect(normalized).not.toBeNull();
    expect(SemanticBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('all optional fields populated normalizes and passes schema', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'full',
      template: 'jacobian_mapping_2panel',
      style_preset: 'blueprint_neat',
      intent: 'derive',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          region_hint: 'left',
          title: 'Step 1',
          align: 'center',
          lines: [
            { id: 'l1', tex: '\\frac{d}{dx}', displayMode: true, role: 'step' },
            { id: 'l2', tex: '= 2x', role: 'result' },
          ],
        },
        {
          id: 'dp1',
          kind: 'diagram_panel',
          region_hint: 'right',
          title: 'Graph',
          axes: { x_label: 'x', y_label: 'f(x)' },
          shapes: [
            { id: 's1', type: 'line', relative_pose: { x: 0.1, y: 0.9, w: 0.8, h: 0.1, rotation_deg: 45 } },
          ],
          captions: [{ id: 'c1', text: 'Derivative plot', anchor: 'top' }],
        },
        { id: 'cap1', kind: 'caption', text: 'Summary', region_hint: 'bottom' },
      ],
      relations: [
        {
          id: 'r1',
          type: 'maps_to',
          from_block_id: 'eq1',
          to_block_id: 'dp1',
          from_anchor: 'right',
          to_anchor: 'left',
          label: 'visualizes',
        },
      ],
    });
    expect(normalized).not.toBeNull();
    const result = SemanticBatchSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });

  it('normalizer coerces invalid template to freeform_semantic and passes schema', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b',
      template: 'hexagonal',
      blocks: [{ id: 'c1', kind: 'caption', text: 'hi' }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.template).toBe('freeform_semantic');
    expect(warnings.some((w) => w.includes('template'))).toBe(true);
    expect(SemanticBatchSchema.safeParse(normalized).success).toBe(true);
  });

  it('normalizer clamps relative_pose and still passes schema', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'b',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'dp1',
          kind: 'diagram_panel',
          shapes: [
            {
              id: 's1',
              type: 'rect',
              relative_pose: { x: 1.5, y: -0.3 },
            },
          ],
        },
      ],
    });
    expect(normalized).not.toBeNull();
    const panel = normalized!.blocks[0];
    expect(panel.kind).toBe('diagram_panel');
    if (panel.kind === 'diagram_panel') {
      const pose = panel.shapes?.[0]?.relative_pose;
      expect(pose).toBeDefined();
      expect(pose!.x).toBe(1);
      expect(pose!.y).toBe(0);
    }
    expect(warnings.some((w) => w.includes('clamped'))).toBe(true);
    expect(SemanticBatchSchema.safeParse(normalized).success).toBe(true);
  });
});
