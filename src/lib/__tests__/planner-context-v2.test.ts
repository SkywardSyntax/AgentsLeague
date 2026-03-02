import { describe, expect, it } from 'vitest';
import { buildStructuredWhiteboardContext } from '@/lib/whiteboard/planner';
import type { DrawElement, SemanticBatch } from '@/types/agent';

describe('structured whiteboard context v2', () => {
  it('builds compact scene summary with occupied regions and suggested regions', () => {
    const scene: DrawElement[] = [
      { id: 'a1', type: 'arrow', from: { x: 100, y: 120 }, to: { x: 320, y: 120 } },
      { id: 'eq1', type: 'latex', x: 110, y: 220, tex: 'x^2+1=0', displayMode: true, fontSize: 24 },
    ];

    const semanticScene: SemanticBatch[] = [
      {
        batch_id: 'sem-1',
        template: 'equation_derivation_vertical',
        blocks: [
          {
            id: 'eq',
            kind: 'equation_stack',
            lines: [{ id: 'l1', tex: 'x^2+1=0' }],
          },
        ],
      },
    ];

    const context = buildStructuredWhiteboardContext(scene, semanticScene);
    expect(context.scene_summary.element_count).toBe(2);
    expect(context.occupied_regions.length).toBeGreaterThan(0);
    expect(context.anchors.length).toBeGreaterThan(0);
    expect(context.suggested_next_regions.length).toBeGreaterThan(0);
    expect(context.recent_blocks.length).toBeGreaterThan(0);
  });
});
