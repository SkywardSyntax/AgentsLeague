import { describe, expect, it } from 'vitest';
import { planSemanticBatch } from '@/lib/whiteboard/planner';
import type { SemanticBatch } from '@/types/agent';

describe('planner templates', () => {
  it('lays out equation_derivation_vertical with increasing y for equation lines', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-1',
      template: 'equation_derivation_vertical',
      blocks: [
        {
          id: 'eqs',
          kind: 'equation_stack',
          title: 'Quadratic derivation',
          lines: [
            { id: 'l1', tex: 'ax^2+bx+c=0', displayMode: true },
            { id: 'l2', tex: 'x^2+\\frac{b}{a}x+\\frac{c}{a}=0', displayMode: true },
            { id: 'l3', tex: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', displayMode: true, role: 'result' },
          ],
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const lineEls = planned.elements.filter((el) => el.type === 'latex');
    expect(lineEls.length).toBeGreaterThanOrEqual(3);

    const ys = lineEls.map((el) => (el.type === 'latex' ? el.y : 0));
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
    }
  });

  it('lays out jacobian_mapping_2panel with both axis labels', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-2',
      template: 'jacobian_mapping_2panel',
      blocks: [
        {
          id: 'left-panel',
          kind: 'diagram_panel',
          axes: { x_label: 'u', y_label: 'v' },
        },
        {
          id: 'right-panel',
          kind: 'diagram_panel',
          axes: { x_label: 'x', y_label: 'y' },
        },
      ],
      relations: [
        { id: 'r1', type: 'maps_to', from_block_id: 'left-panel', to_block_id: 'right-panel', label: 'F' },
      ],
    };

    const planned = planSemanticBatch(batch);
    const labels = planned.elements.filter((el) => el.type === 'text').map((el) => (el.type === 'text' ? el.text : ''));

    expect(labels.some((txt) => txt === 'u')).toBe(true);
    expect(labels.some((txt) => txt === 'v')).toBe(true);
    expect(labels.some((txt) => txt === 'x')).toBe(true);
    expect(labels.some((txt) => txt === 'y')).toBe(true);
    expect(labels.some((txt) => txt.includes('F'))).toBe(true);
  });

  it('does not inject template-specific default panels when none are provided', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-3',
      template: 'jacobian_mapping_2panel',
      blocks: [
        {
          id: 'eq',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'J(u,v)=\\det\\left(\\frac{\\partial(x,y)}{\\partial(u,v)}\\right)' }],
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const textLabels = planned.elements
      .filter((el) => el.type === 'text')
      .map((el) => (el.type === 'text' ? el.text : ''));

    expect(textLabels).not.toContain('x');
    expect(textLabels).not.toContain('y');
    expect(textLabels).not.toContain('u');
    expect(textLabels).not.toContain('v');
  });

  it('compacts verbose semantic payloads for legibility', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-4',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'panel',
          kind: 'diagram_panel',
          shapes: new Array(9).fill(null).map((_, i) => ({
            id: `shape-${i}`,
            type: 'line',
          })),
          captions: [
            { id: 'c1', text: 'first caption', anchor: 'bottom' },
            { id: 'c2', text: 'second caption', anchor: 'bottom' },
            { id: 'c3', text: 'third caption should be trimmed', anchor: 'bottom' },
          ],
        },
        {
          id: 'eq',
          kind: 'equation_stack',
          lines: new Array(10).fill(null).map((_, i) => ({
            id: `l${i}`,
            tex: `x_${i}=\\frac{${i + 1}}{${i + 2}}`,
            displayMode: true,
          })),
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const normalized = planned.semanticBatch;
    const panel = normalized.blocks.find((b) => b.id === 'panel');
    const eq = normalized.blocks.find((b) => b.id === 'eq');

    expect(panel?.kind).toBe('diagram_panel');
    if (panel?.kind === 'diagram_panel') {
      expect(panel.shapes?.length).toBeLessThanOrEqual(5);
      expect(panel.captions?.length).toBeLessThanOrEqual(2);
    }

    expect(eq?.kind).toBe('equation_stack');
    if (eq?.kind === 'equation_stack') {
      expect(eq.lines.length).toBeLessThanOrEqual(6);
    }
  });
});
