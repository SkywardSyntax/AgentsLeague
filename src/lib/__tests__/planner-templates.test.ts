import { describe, expect, it } from 'vitest';
import { planSemanticBatch, measureBlock } from '@/lib/whiteboard/planner';
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

  it('renders relations between diagram panels and equation stacks', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-cross',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'panel1',
          kind: 'diagram_panel',
          axes: { x_label: 'x', y_label: 'y' },
        },
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'f(x)=x^2' }],
        },
      ],
      relations: [
        {
          id: 'rel1',
          type: 'explains',
          from_block_id: 'panel1',
          to_block_id: 'eq1',
          label: 'derives',
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const arrows = planned.elements.filter((el) => el.type === 'arrow');
    const relLabel = planned.elements.find(
      (el) => el.type === 'text' && el.id === 'rel1-label',
    );

    // Cross-type relation should produce an arrow
    expect(arrows.some((a) => a.id === 'rel1')).toBe(true);
    // And a label
    expect(relLabel).toBeDefined();
    if (relLabel?.type === 'text') {
      expect(relLabel.text).toBe('derives');
    }
  });

  it('creates non-overlapping lane regions for single-panel layouts', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-lanes',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'eq-left',
          kind: 'equation_stack',
          region_hint: 'left',
          lines: [{ id: 'l1', tex: 'a=1' }],
        },
        {
          id: 'eq-right',
          kind: 'equation_stack',
          region_hint: 'right',
          lines: [{ id: 'l2', tex: 'b=2' }],
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const leftEq = planned.elements.find(
      (el) => el.type === 'latex' && el.id.startsWith('eq-left'),
    );
    const rightEq = planned.elements.find(
      (el) => el.type === 'latex' && el.id.startsWith('eq-right'),
    );

    expect(leftEq).toBeDefined();
    expect(rightEq).toBeDefined();
    if (leftEq?.type === 'latex' && rightEq?.type === 'latex') {
      // Right lane content should be placed at a distinctly different x
      expect(rightEq.x).toBeGreaterThan(leftEq.x + 100);
    }
  });

  it('measureBlock returns reasonable height for equation stack', () => {
    const block = {
      id: 'eq-measure',
      kind: 'equation_stack' as const,
      lines: [
        { id: 'l1', tex: 'x=1', displayMode: true },
        { id: 'l2', tex: 'y=2', displayMode: true },
        { id: 'l3', tex: 'z=3', displayMode: true },
      ],
    };

    const { height } = measureBlock(block, 600);
    // 3 equation lines should produce meaningful height (> 100px)
    expect(height).toBeGreaterThan(100);
    expect(height).toBeLessThan(800);
  });

  it('measureBlock returns reasonable height for caption block', () => {
    const block = {
      id: 'cap-measure',
      kind: 'caption' as const,
      text: 'This is a short caption for testing.',
    };

    const { height } = measureBlock(block, 600);
    expect(height).toBeGreaterThan(20);
    expect(height).toBeLessThan(200);
  });

  it('measureBlock returns reasonable height for diagram panel', () => {
    const block = {
      id: 'dp-measure',
      kind: 'diagram_panel' as const,
      title: 'Test panel',
      axes: { x_label: 'x', y_label: 'y' },
    };

    const { height } = measureBlock(block, 600);
    // Should include title + panel min height (210)
    expect(height).toBeGreaterThanOrEqual(210);
  });

  it('distributes auto-hinted blocks across lanes using balance tiebreak', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-balance',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'a=1' }],
        },
        {
          id: 'eq2',
          kind: 'equation_stack',
          lines: [{ id: 'l2', tex: 'b=2' }],
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const eq1 = planned.elements.find(
      (el) => el.type === 'latex' && el.id.startsWith('eq1'),
    );
    const eq2 = planned.elements.find(
      (el) => el.type === 'latex' && el.id.startsWith('eq2'),
    );

    expect(eq1).toBeDefined();
    expect(eq2).toBeDefined();
    if (eq1?.type === 'latex' && eq2?.type === 'latex') {
      // With balance tiebreak, two auto-hinted blocks should go to different lanes
      expect(eq1.x).not.toBe(eq2.x);
    }
  });

  it('places annotation block with arrow and text near target', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-anno',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'eq-target',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'E=mc^2' }],
        },
        {
          id: 'anno1',
          kind: 'annotation',
          target_block_id: 'eq-target',
          text: 'Famous energy equation',
          style: 'callout',
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const arrow = planned.elements.find((el) => el.id === 'anno1-arrow');
    const textEls = planned.elements.filter((el) => el.id.startsWith('anno1-text'));

    expect(arrow).toBeDefined();
    expect(arrow?.type).toBe('arrow');
    expect(textEls.length).toBeGreaterThan(0);
  });

  it('annotation with underline style places text below target', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-anno-under',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'eq-target',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'a+b=c' }],
        },
        {
          id: 'anno-u',
          kind: 'annotation',
          target_block_id: 'eq-target',
          text: 'Triangle identity',
          style: 'underline',
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const arrow = planned.elements.find((el) => el.id === 'anno-u-arrow');
    expect(arrow).toBeDefined();
    expect(arrow?.type).toBe('arrow');
  });

  it('annotation with missing target emits warning', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-anno-missing',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'anno-orphan',
          kind: 'annotation',
          target_block_id: 'nonexistent',
          text: 'Orphaned annotation',
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    expect(planned.warnings.some((w) => w.includes('nonexistent'))).toBe(true);
    // No arrow should be emitted for orphaned annotation
    const arrow = planned.elements.find((el) => el.id === 'anno-orphan-arrow');
    expect(arrow).toBeUndefined();
  });

  it('compactSemanticBatchForLegibility trims annotation text', () => {
    const batch: SemanticBatch = {
      batch_id: 'sem-anno-compact',
      template: 'freeform_semantic',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [{ id: 'l1', tex: 'x=1' }],
        },
        {
          id: 'anno-long',
          kind: 'annotation',
          target_block_id: 'eq1',
          text: 'A'.repeat(100),
        },
      ],
    };

    const planned = planSemanticBatch(batch);
    const annoBlock = planned.semanticBatch.blocks.find((b) => b.id === 'anno-long');
    expect(annoBlock).toBeDefined();
    if (annoBlock?.kind === 'annotation') {
      expect(annoBlock.text.length).toBeLessThanOrEqual(61); // 60 + ellipsis
    }
  });

  it('measureBlock returns reasonable height for annotation block', () => {
    const block = {
      id: 'anno-measure',
      kind: 'annotation' as const,
      target_block_id: 'some-target',
      text: 'This is a test annotation.',
    };

    const { height } = measureBlock(block, 600);
    expect(height).toBeGreaterThan(10);
    expect(height).toBeLessThan(200);
  });
});
