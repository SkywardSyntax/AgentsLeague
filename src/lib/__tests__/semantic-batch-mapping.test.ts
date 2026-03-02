import { describe, expect, it } from 'vitest';
import { normalizeSemanticBatchPayload } from '@/lib/schema';

describe('iter28 · Semantic→DrawBatch mapping correctness', () => {
  it('equation_stack preserves all line tex, role, displayMode fields', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'sb1',
      template: 'equation_derivation_vertical',
      blocks: [{
        id: 'eq1', kind: 'equation_stack',
        lines: [
          { id: 'l1', tex: 'x^2', role: 'step', displayMode: true },
          { id: 'l2', tex: '2x', role: 'result' },
          { id: 'l3', tex: 'note', role: 'note', displayMode: false },
        ],
      }],
    });
    expect(normalized).not.toBeNull();
    const block = normalized!.blocks[0]!;
    expect(block.kind).toBe('equation_stack');
    if (block.kind === 'equation_stack') {
      expect(block.lines).toHaveLength(3);
      expect(block.lines[0]!.tex).toBe('x^2');
      expect(block.lines[0]!.role).toBe('step');
      expect(block.lines[0]!.displayMode).toBe(true);
      expect(block.lines[1]!.role).toBe('result');
      expect(block.lines[2]!.displayMode).toBe(false);
    }
  });

  it('diagram_panel preserves axes labels, shapes with types, captions', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'sb2',
      template: 'jacobian_mapping_2panel',
      blocks: [{
        id: 'dp1', kind: 'diagram_panel',
        axes: { x_label: 'Time', y_label: 'Value' },
        shapes: [
          { id: 's1', type: 'rect', label: 'Box' },
          { id: 's2', type: 'arrow', label: 'Flow' },
        ],
        captions: [{ id: 'c1', text: 'Figure 1', anchor: 'bottom' }],
      }],
    });
    expect(normalized).not.toBeNull();
    const block = normalized!.blocks[0]!;
    if (block.kind === 'diagram_panel') {
      expect(block.axes).toEqual({ x_label: 'Time', y_label: 'Value' });
      expect(block.shapes).toHaveLength(2);
      expect(block.shapes![0]!.type).toBe('rect');
      expect(block.shapes![1]!.label).toBe('Flow');
      expect(block.captions).toHaveLength(1);
      expect(block.captions![0]!.anchor).toBe('bottom');
    }
  });

  it('caption block preserves text and region_hint', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'sb3',
      template: 'freeform_semantic',
      blocks: [{ id: 'cap1', kind: 'caption', text: 'Summary note', region_hint: 'center' }],
    });
    expect(normalized).not.toBeNull();
    const block = normalized!.blocks[0]!;
    if (block.kind === 'caption') {
      expect(block.text).toBe('Summary note');
      expect(block.region_hint).toBe('center');
    }
  });

  it('all template enum values pass through', () => {
    const templates = ['equation_derivation_vertical', 'jacobian_mapping_2panel', 'freeform_semantic'] as const;
    for (const template of templates) {
      const { normalized } = normalizeSemanticBatchPayload({
        batch_id: `t-${template}`,
        template,
        blocks: [{ id: 'b1', kind: 'caption', text: 'test' }],
      });
      expect(normalized).not.toBeNull();
      expect(normalized!.template).toBe(template);
    }
  });

  it('all intent enum values pass through', () => {
    const intents = ['teach', 'derive', 'compare', 'summarize'] as const;
    for (const intent of intents) {
      const { normalized } = normalizeSemanticBatchPayload({
        batch_id: `i-${intent}`,
        template: 'freeform_semantic',
        intent,
        blocks: [{ id: 'b1', kind: 'caption', text: 'test' }],
      });
      expect(normalized).not.toBeNull();
      expect(normalized!.intent).toBe(intent);
    }
  });

  it('all relation types pass through', () => {
    const types = ['maps_to', 'explains', 'derived_from', 'points_to'] as const;
    for (const type of types) {
      const { normalized } = normalizeSemanticBatchPayload({
        batch_id: `r-${type}`,
        template: 'freeform_semantic',
        blocks: [
          { id: 'b1', kind: 'caption', text: 'A' },
          { id: 'b2', kind: 'caption', text: 'B' },
        ],
        relations: [{ id: 'rel1', type, from_block_id: 'b1', to_block_id: 'b2' }],
      });
      expect(normalized).not.toBeNull();
      expect(normalized!.relations).toHaveLength(1);
      expect(normalized!.relations![0]!.type).toBe(type);
    }
  });

  it('relative_pose clamped to [0,1] with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'sb-clamp',
      template: 'freeform_semantic',
      blocks: [{
        id: 'dp1', kind: 'diagram_panel',
        shapes: [{ id: 's1', type: 'rect', relative_pose: { x: 1.5, y: -0.3, w: 2.0, h: 0.5 } }],
      }],
    });
    expect(normalized).not.toBeNull();
    const block = normalized!.blocks[0]!;
    if (block.kind === 'diagram_panel') {
      const pose = block.shapes![0]!.relative_pose!;
      expect(pose.x).toBe(1);
      expect(pose.y).toBe(0);
      expect(pose.w).toBe(1);
      expect(pose.h).toBe(0.5);
    }
    expect(warnings.some(w => w.includes('clamped'))).toBe(true);
  });

  it('invalid template defaults to freeform_semantic with warning', () => {
    const { normalized, warnings } = normalizeSemanticBatchPayload({
      batch_id: 'sb-bad-tmpl',
      template: 'nonexistent_template',
      blocks: [{ id: 'b1', kind: 'caption', text: 'test' }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.template).toBe('freeform_semantic');
    expect(warnings.some(w => w.includes('template'))).toBe(true);
  });

  it('diagram_panel with partial axes auto-fills missing label', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'sb-axes',
      template: 'freeform_semantic',
      blocks: [{
        id: 'dp1', kind: 'diagram_panel',
        axes: { x_label: 'Time' },
      }],
    });
    expect(normalized).not.toBeNull();
    const block = normalized!.blocks[0]!;
    if (block.kind === 'diagram_panel') {
      expect(block.axes!.x_label).toBe('Time');
      expect(block.axes!.y_label).toBe('y');
    }
  });

  it('equation_stack with latex alias for tex still normalizes', () => {
    const { normalized } = normalizeSemanticBatchPayload({
      batch_id: 'sb-alias',
      template: 'freeform_semantic',
      blocks: [{
        id: 'eq1', kind: 'equation_stack',
        lines: [{ id: 'l1', latex: '\\int_0^1 f(x) dx' }],
      }],
    });
    expect(normalized).not.toBeNull();
    const block = normalized!.blocks[0]!;
    if (block.kind === 'equation_stack') {
      expect(block.lines[0]!.tex).toBe('\\int_0^1 f(x) dx');
    }
  });
});
