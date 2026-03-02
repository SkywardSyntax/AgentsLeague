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

  it('produces fallback block when all captions have empty text', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-empty',
      template: 'freeform_semantic',
      blocks: [
        { id: 'c1', kind: 'caption', text: '', region_hint: 'bottom' },
      ],
    };
    const planned = planSemanticBatch(batch);
    expect(planned.semanticBatch.blocks.length).toBe(1);
    expect(planned.semanticBatch.blocks[0]!.id).toContain('fallback');
  });

  it('produces fallback block when all captions have whitespace-only text', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-ws',
      template: 'freeform_semantic',
      blocks: [
        { id: 'c1', kind: 'caption', text: '   ', region_hint: 'bottom' },
        { id: 'c2', kind: 'caption', text: '\t\n', region_hint: 'center' },
      ],
    };
    const planned = planSemanticBatch(batch);
    expect(planned.semanticBatch.blocks.length).toBe(1);
    expect(planned.semanticBatch.blocks[0]!.id).toContain('fallback');
  });

  it('wraps long caption text into multiple text elements with increasing y', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-wrap',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'panel1',
          kind: 'diagram_panel',
          axes: { x_label: 'x', y_label: 'y' },
        },
        {
          id: 'panel2',
          kind: 'diagram_panel',
          axes: { x_label: 'u', y_label: 'v' },
        },
        {
          id: 'long-cap',
          kind: 'caption',
          text: 'Long caption text that wraps across multiple lines in the layout region',
          region_hint: 'auto',
        },
      ],
    };
    const planned = planSemanticBatch(batch);
    const textEls = planned.elements.filter(
      (el) => el.type === 'text' && el.id.startsWith('long-cap'),
    );
    expect(textEls.length).toBeGreaterThanOrEqual(2);
    const ys = textEls.map((el) => (el.type === 'text' ? el.y : 0));
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
    }
  });

  it('produces wider y-spacing for equations with nested fractions', () => {
    const simpleBatch: SemanticBatch = {
      batch_id: 'sem-simple',
      template: 'freeform_semantic',
      blocks: [{
        id: 'simple-eq',
        kind: 'equation_stack',
        lines: [
          { id: 'l1', tex: 'x + y = z', displayMode: true },
          { id: 'l2', tex: 'a + b = c', displayMode: true },
        ],
      }],
    };
    const fracBatch: SemanticBatch = {
      batch_id: 'sem-frac',
      template: 'freeform_semantic',
      blocks: [{
        id: 'frac-eq',
        kind: 'equation_stack',
        lines: [
          { id: 'l1', tex: '\\frac{\\frac{a}{b}}{c}', displayMode: true },
          { id: 'l2', tex: '\\frac{\\frac{x}{y}}{z}', displayMode: true },
        ],
      }],
    };
    const simplePlanned = planSemanticBatch(simpleBatch);
    const fracPlanned = planSemanticBatch(fracBatch);
    const simpleLatex = simplePlanned.elements.filter((el) => el.type === 'latex');
    const fracLatex = fracPlanned.elements.filter((el) => el.type === 'latex');
    const simpleSpacing = (simpleLatex[1] as { y: number }).y - (simpleLatex[0] as { y: number }).y;
    const fracSpacing = (fracLatex[1] as { y: number }).y - (fracLatex[0] as { y: number }).y;
    expect(fracSpacing).toBeGreaterThan(simpleSpacing);
  });

  it('produces tighter spacing for equations with displayMode=false', () => {
    const displayBatch: SemanticBatch = {
      batch_id: 'sem-disp',
      template: 'freeform_semantic',
      blocks: [{
        id: 'display-eq',
        kind: 'equation_stack',
        lines: [
          { id: 'l1', tex: 'x + y', displayMode: true },
          { id: 'l2', tex: 'a + b', displayMode: true },
        ],
      }],
    };
    const inlineBatch: SemanticBatch = {
      batch_id: 'sem-inline',
      template: 'freeform_semantic',
      blocks: [{
        id: 'inline-eq',
        kind: 'equation_stack',
        lines: [
          { id: 'l1', tex: 'x + y', displayMode: false },
          { id: 'l2', tex: 'a + b', displayMode: false },
        ],
      }],
    };
    const displayPlanned = planSemanticBatch(displayBatch);
    const inlinePlanned = planSemanticBatch(inlineBatch);
    const displayLatex = displayPlanned.elements.filter((el) => el.type === 'latex');
    const inlineLatex = inlinePlanned.elements.filter((el) => el.type === 'latex');
    const displaySpacing = (displayLatex[1] as { y: number }).y - (displayLatex[0] as { y: number }).y;
    const inlineSpacing = (inlineLatex[1] as { y: number }).y - (inlineLatex[0] as { y: number }).y;
    expect(displaySpacing).toBeGreaterThan(inlineSpacing);
  });

  it('compacts equation stack title longer than 54 chars with ellipsis', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-long-title',
      template: 'freeform_semantic',
      blocks: [{
        id: 'eq',
        kind: 'equation_stack',
        title: 'This is an extremely long title that exceeds fifty-four characters limit',
        lines: [{ id: 'l1', tex: 'x = 1' }],
      }],
    };
    const planned = planSemanticBatch(batch);
    const eqBlock = planned.semanticBatch.blocks.find((b) => b.id === 'eq');
    expect(eqBlock?.kind).toBe('equation_stack');
    if (eqBlock?.kind === 'equation_stack') {
      expect(eqBlock.title!.length).toBeLessThanOrEqual(54);
      expect(eqBlock.title!.endsWith('…')).toBe(true);
    }
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
