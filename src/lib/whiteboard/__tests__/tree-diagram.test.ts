import { describe, it, expect } from 'vitest';
import { planSemanticBatch } from '@/lib/whiteboard/planner/templates';
import type { SemanticBatch, DrawElement } from '@/types/agent';

function elementsOfType(elements: DrawElement[], type: string): DrawElement[] {
  return elements.filter((e) => e.type === type);
}

function countNodes(elements: DrawElement[], blockId: string): number {
  return elements.filter(
    (e) => e.type === 'ellipse' && e.id.startsWith(`${blockId}-node-`),
  ).length;
}

function countEdges(elements: DrawElement[], blockId: string): number {
  return elements.filter(
    (e) => e.type === 'line' && e.id.startsWith(`${blockId}-edge-`),
  ).length;
}

describe('tree_diagram template', () => {
  it('single root produces 1 node and 0 edges', () => {
    const batch: SemanticBatch = {
      batch_id: 'tree-single',
      template: 'tree_diagram',
      blocks: [
        {
          kind: 'tree_node',
          id: 't1',
          cx: 600,
          cy: 100,
          root: { label: 'Root' },
        },
      ],
    };

    const result = planSemanticBatch(batch);

    expect(countNodes(result.elements, 't1')).toBe(1);
    expect(countEdges(result.elements, 't1')).toBe(0);
  });

  it('root + 2 children produces 3 nodes and 2 edges', () => {
    const batch: SemanticBatch = {
      batch_id: 'tree-2kids',
      template: 'tree_diagram',
      blocks: [
        {
          kind: 'tree_node',
          id: 't1',
          cx: 600,
          cy: 100,
          root: {
            label: 'A',
            children: [{ label: 'B' }, { label: 'C' }],
          },
        },
      ],
    };

    const result = planSemanticBatch(batch);

    expect(countNodes(result.elements, 't1')).toBe(3);
    expect(countEdges(result.elements, 't1')).toBe(2);
  });

  it('3 levels produces correct node count', () => {
    const batch: SemanticBatch = {
      batch_id: 'tree-3lvl',
      template: 'tree_diagram',
      blocks: [
        {
          kind: 'tree_node',
          id: 't1',
          cx: 600,
          cy: 100,
          root: {
            label: '1',
            children: [
              {
                label: '2',
                children: [{ label: '4' }, { label: '5' }],
              },
              {
                label: '3',
                children: [{ label: '6' }],
              },
            ],
          },
        },
      ],
    };

    const result = planSemanticBatch(batch);

    // 6 nodes total: 1 + 2 + 3
    expect(countNodes(result.elements, 't1')).toBe(6);
    // 5 edges: 2 from root, 2 from node '2', 1 from node '3'
    expect(countEdges(result.elements, 't1')).toBe(5);
  });

  it('children are positioned below parents (higher y)', () => {
    const batch: SemanticBatch = {
      batch_id: 'tree-pos',
      template: 'tree_diagram',
      blocks: [
        {
          kind: 'tree_node',
          id: 't1',
          cx: 600,
          cy: 100,
          levelHeight: 80,
          root: {
            label: 'Parent',
            children: [{ label: 'Child1' }, { label: 'Child2' }],
          },
        },
      ],
    };

    const result = planSemanticBatch(batch);

    const ellipses = result.elements.filter(
      (e): e is Extract<DrawElement, { type: 'ellipse' }> =>
        e.type === 'ellipse' && e.id.startsWith('t1-node-'),
    );

    // Root is at cy=100
    const rootNode = ellipses[0]!;
    expect(rootNode.cy).toBe(100);

    // Children should be at cy=180 (100 + levelHeight=80)
    const childNodes = ellipses.slice(1);
    for (const child of childNodes) {
      expect(child.cy).toBeGreaterThan(rootNode.cy);
      expect(child.cy).toBe(100 + 80);
    }
  });
});

describe('graph_diagram edge weights', () => {
  it('renders weight label when edge has weight but no label', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-weights',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'A', label: 'A', x: 200, y: 300 },
        { kind: 'node', id: 'B', label: 'B', x: 600, y: 300 },
        { kind: 'edge', id: 'e1', from: 'A', to: 'B', weight: 5, directed: true },
      ],
    };

    const result = planSemanticBatch(batch);

    // Weight should be used as the edge label
    const weightLabel = result.elements.find(
      (e) => e.id === 'e1-label' && e.type === 'text',
    );
    expect(weightLabel).toBeTruthy();
    if (weightLabel && weightLabel.type === 'text') {
      expect(weightLabel.text).toBe('5');
    }
  });

  it('renders both label and weight when both exist', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-label-weight',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'A', label: 'A', x: 200, y: 300 },
        { kind: 'node', id: 'B', label: 'B', x: 600, y: 300 },
        {
          kind: 'edge',
          id: 'e1',
          from: 'A',
          to: 'B',
          label: 'cost',
          weight: 10,
          directed: true,
        },
      ],
    };

    const result = planSemanticBatch(batch);

    // The label text should show the label (not weight) since label is primary
    const label = result.elements.find(
      (e) => e.id === 'e1-label' && e.type === 'text',
    );
    expect(label).toBeTruthy();
    if (label && label.type === 'text') {
      expect(label.text).toBe('cost');
    }

    // Weight should be rendered separately
    const weightEl = result.elements.find(
      (e) => e.id === 'e1-weight' && e.type === 'text',
    );
    expect(weightEl).toBeTruthy();
    if (weightEl && weightEl.type === 'text') {
      expect(weightEl.text).toBe('10');
    }
  });
});

describe('graph_diagram circular layout', () => {
  it('places nodes on a circle when layout=circular', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({
      kind: 'node' as const,
      id: `n${i}`,
      label: `N${i}`,
    }));

    const batch: SemanticBatch = {
      batch_id: 'test-circular',
      template: 'graph_diagram',
      blocks: nodes,
    };
    // Attach layout hint
    (batch as SemanticBatch & { layout?: string }).layout = 'circular';

    const result = planSemanticBatch(batch);

    const ellipses = result.elements.filter(
      (e): e is Extract<DrawElement, { type: 'ellipse' }> => e.type === 'ellipse',
    );
    expect(ellipses.length).toBe(5);

    // All nodes should be roughly equidistant from center
    const cx = 700;
    const cy = 350;
    const distances = ellipses.map((e) =>
      Math.sqrt((e.cx - cx) ** 2 + (e.cy - cy) ** 2),
    );
    const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    for (const d of distances) {
      expect(Math.abs(d - avgDist)).toBeLessThan(2); // All at same radius
    }
  });
});

describe('tree_diagram schema validation', () => {
  it('SemanticBatchSchema validates a tree_diagram batch', async () => {
    const { SemanticBatchSchema } = await import('@/lib/schema');

    const payload = {
      batch_id: 'schema-tree',
      template: 'tree_diagram',
      blocks: [
        {
          kind: 'tree_node',
          id: 't1',
          cx: 600,
          cy: 100,
          root: {
            label: 'Root',
            children: [{ label: 'A' }, { label: 'B' }],
          },
        },
      ],
    };

    const result = SemanticBatchSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe('graph_diagram bidirectional auto-curve', () => {
  it('auto-curves bidirectional edges into segments', () => {
    const batch: SemanticBatch = {
      batch_id: 'test-bidir',
      template: 'graph_diagram',
      blocks: [
        { kind: 'node', id: 'A', label: 'A', x: 200, y: 300 },
        { kind: 'node', id: 'B', label: 'B', x: 600, y: 300 },
        { kind: 'edge', id: 'e1', from: 'A', to: 'B', directed: true },
        { kind: 'edge', id: 'e2', from: 'B', to: 'A', directed: true },
      ],
    };

    const result = planSemanticBatch(batch);

    // Both edges should be rendered as curve segments (not straight)
    const e1Segs = result.elements.filter((e) => e.id.startsWith('e1-seg'));
    const e2Segs = result.elements.filter((e) => e.id.startsWith('e2-seg'));
    expect(e1Segs.length).toBe(5);
    expect(e2Segs.length).toBe(5);
  });
});

describe('tree_diagram node values', () => {
  it('renders value in the label text when present', () => {
    const batch: SemanticBatch = {
      batch_id: 'tree-val',
      template: 'tree_diagram',
      blocks: [
        {
          kind: 'tree_node',
          id: 't1',
          cx: 600,
          cy: 100,
          root: { label: 'score', value: 42 },
        },
      ],
    };

    const result = planSemanticBatch(batch);

    const label = result.elements.find(
      (e) => e.type === 'text' && e.id.startsWith('t1-nlbl-'),
    );
    expect(label).toBeTruthy();
    if (label && label.type === 'text') {
      expect(label.text).toBe('score: 42');
    }
  });
});
