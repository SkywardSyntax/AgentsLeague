import { describe, it, expect } from 'vitest';
import { planSemanticBatch } from '@/lib/whiteboard/planner/templates';
import type { SemanticBatch, DrawElement } from '@/types/agent';

function elementsOfType(elements: DrawElement[], type: string): DrawElement[] {
  return elements.filter((e) => e.type === type);
}

describe('graph_diagram template', () => {
  it('produces correct node shapes + arrows for a 3-node graph', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-3node',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'A', label: 'Start', shape: 'circle', x: 200, y: 300 },
        { kind: 'node', id: 'B', label: 'Process', shape: 'rect', x: 500, y: 300 },
        { kind: 'node', id: 'C', label: 'End', shape: 'double_circle', x: 800, y: 300 },
        { kind: 'edge', id: 'e1', from: 'A', to: 'B', label: '→', directed: true },
        { kind: 'edge', id: 'e2', from: 'B', to: 'C', label: 'done', directed: true },
      ],
    };

    const result = planSemanticBatch(batch);

    // Node A: 1 ellipse (circle) + label
    expect(result.elements.find((e) => e.id === 'A' && e.type === 'ellipse')).toBeTruthy();

    // Node B: 1 rect + label
    expect(result.elements.find((e) => e.id === 'B' && e.type === 'rect')).toBeTruthy();

    // Node C (double_circle): 2 ellipses (outer + inner) + label
    expect(result.elements.find((e) => e.id === 'C-outer' && e.type === 'ellipse')).toBeTruthy();
    expect(result.elements.find((e) => e.id === 'C' && e.type === 'ellipse')).toBeTruthy();

    // Edges: 2 arrows
    const arrows = elementsOfType(result.elements, 'arrow');
    expect(arrows.length).toBeGreaterThanOrEqual(2);

    // Edge labels
    expect(result.elements.find((e) => e.id === 'e1-label' && e.type === 'text')).toBeTruthy();
    expect(result.elements.find((e) => e.id === 'e2-label' && e.type === 'text')).toBeTruthy();

    // Node labels
    expect(result.elements.find((e) => e.id === 'A-label' && e.type === 'text')).toBeTruthy();
    expect(result.elements.find((e) => e.id === 'B-label' && e.type === 'text')).toBeTruthy();
    expect(result.elements.find((e) => e.id === 'C-label' && e.type === 'text')).toBeTruthy();
  });

  it('produces arc elements for a self-loop', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-selfloop',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'q0', label: 'q₀', shape: 'circle', x: 400, y: 350 },
        { kind: 'edge', id: 'loop', from: 'q0', to: 'q0', label: 'a', directed: true },
      ],
    };

    const result = planSemanticBatch(batch);

    // Self-loop produces an ellipse for the arc
    const loopEllipse = result.elements.find(
      (e) => e.id === 'loop' && e.type === 'ellipse',
    );
    expect(loopEllipse).toBeTruthy();

    // Also has an arrowhead
    const loopArrow = result.elements.find(
      (e) => e.id === 'loop-head' && e.type === 'arrow',
    );
    expect(loopArrow).toBeTruthy();

    // Self-loop label
    expect(result.elements.find((e) => e.id === 'loop-label')).toBeTruthy();

    // The loop ellipse should be above the node (lower y value)
    if (loopEllipse && loopEllipse.type === 'ellipse') {
      expect(loopEllipse.cy).toBeLessThan(350);
    }
  });

  it('auto-layouts nodes when no positions are given', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-autolayout',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'n1', label: 'A' },
        { kind: 'node', id: 'n2', label: 'B' },
        { kind: 'node', id: 'n3', label: 'C' },
        { kind: 'node', id: 'n4', label: 'D' },
        { kind: 'edge', id: 'e1', from: 'n1', to: 'n2', directed: true },
      ],
    };

    const result = planSemanticBatch(batch);

    // Should produce ellipses for 4 nodes (circles by default)
    const ellipses = elementsOfType(result.elements, 'ellipse');
    expect(ellipses.length).toBe(4);

    // All node positions should be within safe canvas area
    for (const el of ellipses) {
      if (el.type === 'ellipse') {
        expect(el.cx).toBeGreaterThanOrEqual(50);
        expect(el.cx).toBeLessThanOrEqual(1350);
        expect(el.cy).toBeGreaterThanOrEqual(50);
        expect(el.cy).toBeLessThanOrEqual(650);
      }
    }

    // Nodes should not all be at the same position
    const positions = ellipses
      .filter((e): e is Extract<DrawElement, { type: 'ellipse' }> => e.type === 'ellipse')
      .map((e) => `${e.cx},${e.cy}`);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(4);
  });

  it('renders diamond-shaped nodes correctly', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-diamond',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'd1', label: 'Decision', shape: 'diamond', x: 400, y: 300 },
      ],
    };

    const result = planSemanticBatch(batch);

    // Diamond: 4 line segments
    const lines = result.elements.filter(
      (e) => e.type === 'line' && e.id.startsWith('d1-d'),
    );
    expect(lines.length).toBe(4);

    // Plus label
    expect(result.elements.find((e) => e.id === 'd1-label')).toBeTruthy();
  });

  it('renders undirected edges as lines (not arrows)', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-undirected',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'A', label: 'A', x: 200, y: 300 },
        { kind: 'node', id: 'B', label: 'B', x: 500, y: 300 },
        { kind: 'edge', id: 'e1', from: 'A', to: 'B', directed: false },
      ],
    };

    const result = planSemanticBatch(batch);

    const edge = result.elements.find((e) => e.id === 'e1');
    expect(edge).toBeTruthy();
    expect(edge!.type).toBe('line');
  });

  it('renders curved edges as multiple segments', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-curved',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'A', label: 'A', x: 200, y: 300 },
        { kind: 'node', id: 'B', label: 'B', x: 600, y: 300 },
        { kind: 'edge', id: 'e1', from: 'A', to: 'B', curved: true, directed: true },
      ],
    };

    const result = planSemanticBatch(batch);

    // Curved edge: 5 segments (4 lines + 1 arrow for last segment)
    const segs = result.elements.filter((e) => e.id.startsWith('e1-seg'));
    expect(segs.length).toBe(5);
    // Last segment should be an arrow (directed)
    expect(segs[segs.length - 1]!.type).toBe('arrow');
  });

  it('warns when edge references a missing node', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-missing',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'A', label: 'A', x: 200, y: 300 },
        { kind: 'edge', id: 'e1', from: 'A', to: 'MISSING', directed: true },
      ],
    };

    const result = planSemanticBatch(batch);
    expect(result.warnings.some((w) => w.includes('MISSING'))).toBe(true);
  });

  it('grid-layouts 7+ nodes in a 3-column grid', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      kind: 'node' as const,
      id: `n${i}`,
      label: `N${i}`,
    }));

    const batch: SemanticBatch = {
      batch_id: 'test-grid',
      template: 'graph_diagram',
      blocks: nodes,
    };

    const result = planSemanticBatch(batch);

    const ellipses = result.elements
      .filter((e): e is Extract<DrawElement, { type: 'ellipse' }> => e.type === 'ellipse');
    expect(ellipses.length).toBe(8);

    // Verify 3-column layout: first 3 nodes should share the same y
    const ys = ellipses.map((e) => e.cy);
    expect(ys[0]).toBe(ys[1]);
    expect(ys[1]).toBe(ys[2]);
    // Row 2 should be different from row 1
    expect(ys[3]).not.toBe(ys[0]);
    expect(ys[3]).toBe(ys[4]);
  });
});
