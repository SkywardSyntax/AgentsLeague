import { describe, it, expect } from 'vitest';
import { normalizeDrawBatchPayload, normalizeSemanticBatchPayload } from '../schema';

describe('normalizeDrawBatchPayload idempotency', () => {
  it('draw batch with rect is idempotent', () => {
    const input = { batch_id: 'b', elements: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50 }] };
    const first = normalizeDrawBatchPayload(input);
    const second = normalizeDrawBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
    expect(second.warnings).toEqual([]);
  });

  it('draw batch with all 7 element types is idempotent', () => {
    const input = {
      batch_id: 'b-all',
      elements: [
        { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
        { id: 'e1', type: 'ellipse', cx: 100, cy: 100, rx: 30, ry: 20 },
        { id: 'ln1', type: 'line', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
        { id: 'a1', type: 'arrow', from: { x: 10, y: 10 }, to: { x: 80, y: 80 } },
        { id: 't1', type: 'text', x: 5, y: 5, text: 'hello', size: 18 },
        { id: 'l1', type: 'latex', x: 200, y: 200, tex: 'x^2+y^2=z^2', displayMode: true, fontSize: 24 },
        { id: 'c1', type: 'clear' },
      ],
    };
    const first = normalizeDrawBatchPayload(input);
    const second = normalizeDrawBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
  });

  it('draw batch with style_preset preserved through double normalize', () => {
    const input = { batch_id: 'b', style_preset: 'rough_sketch', elements: [] };
    const first = normalizeDrawBatchPayload(input);
    const second = normalizeDrawBatchPayload(first.normalized);
    expect(second.normalized!.style_preset).toBe('rough_sketch');
    expect(second.normalized).toEqual(first.normalized);
  });

  it('draw batch batch_id is NOT regenerated on second normalize', () => {
    const input = { batch_id: 'b', elements: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }] };
    const first = normalizeDrawBatchPayload(input);
    expect(first.normalized!.batch_id).toBe('b');
    const second = normalizeDrawBatchPayload(first.normalized);
    expect(second.normalized!.batch_id).toBe('b');
  });

  it('draw batch with color and stroke_width preserved through double normalize', () => {
    const input = {
      batch_id: 'b',
      elements: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50, color: '#ff0000', stroke_width: 2.5 }],
    };
    const first = normalizeDrawBatchPayload(input);
    const el = first.normalized!.elements[0];
    expect((el as Record<string, unknown>).color).toBe('#ff0000');
    expect((el as Record<string, unknown>).stroke_width).toBe(2.5);
    const second = normalizeDrawBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
  });
});

describe('normalizeSemanticBatchPayload idempotency', () => {
  it('semantic batch with caption block is idempotent', () => {
    const input = {
      batch_id: 'b',
      template: 'freeform_semantic',
      blocks: [{ id: 'c1', kind: 'caption', text: 'hello' }],
    };
    const first = normalizeSemanticBatchPayload(input);
    const second = normalizeSemanticBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
  });

  it('semantic batch with equation_stack is idempotent', () => {
    const input = {
      batch_id: 'b-eq',
      template: 'equation_derivation_vertical',
      blocks: [{
        id: 'eq1',
        kind: 'equation_stack',
        lines: [
          { id: 'l1', tex: 'x = 1' },
          { id: 'l2', tex: 'y = 2' },
          { id: 'l3', tex: 'z = x + y', role: 'result' },
        ],
      }],
    };
    const first = normalizeSemanticBatchPayload(input);
    const second = normalizeSemanticBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
  });

  it('semantic batch with diagram_panel + shapes + captions is idempotent', () => {
    const input = {
      batch_id: 'b-panel',
      template: 'freeform_semantic',
      blocks: [{
        id: 'p1',
        kind: 'diagram_panel',
        axes: { x_label: 'X', y_label: 'Y' },
        shapes: [
          { id: 's1', type: 'rect', label: 'Box', relative_pose: { x: 0.3, y: 0.4, w: 0.2, h: 0.1 } },
          { id: 's2', type: 'arrow', label: 'Flow', relative_pose: { x: 0.5, y: 0.6 } },
        ],
        captions: [
          { id: 'cap1', text: 'Figure 1', anchor: 'bottom' },
          { id: 'cap2', text: 'Note', anchor: 'top' },
        ],
      }],
    };
    const first = normalizeSemanticBatchPayload(input);
    const second = normalizeSemanticBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
  });

  it('semantic batch with relations is idempotent', () => {
    const input = {
      batch_id: 'b-rel',
      template: 'freeform_semantic',
      blocks: [
        { id: 'c1', kind: 'caption', text: 'block one' },
        { id: 'c2', kind: 'caption', text: 'block two' },
      ],
      relations: [{
        id: 'rel1',
        type: 'maps_to',
        from_block_id: 'c1',
        to_block_id: 'c2',
      }],
    };
    const first = normalizeSemanticBatchPayload(input);
    const second = normalizeSemanticBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
  });

  it('semantic batch with all optional fields is idempotent', () => {
    const input = {
      batch_id: 'b-full',
      template: 'freeform_semantic',
      style_preset: 'blueprint_neat',
      intent: 'teach',
      blocks: [
        { id: 'c1', kind: 'caption', text: 'source', region_hint: 'bottom' },
        { id: 'c2', kind: 'caption', text: 'target', region_hint: 'center' },
      ],
      relations: [{
        id: 'rel1',
        type: 'explains',
        from_block_id: 'c1',
        to_block_id: 'c2',
        from_anchor: 'right',
        to_anchor: 'left',
        label: 'explains',
      }],
    };
    const first = normalizeSemanticBatchPayload(input);
    const second = normalizeSemanticBatchPayload(first.normalized);
    expect(second.normalized).toEqual(first.normalized);
  });
});
