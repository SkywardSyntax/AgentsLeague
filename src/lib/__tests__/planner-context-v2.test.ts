import { describe, expect, it } from 'vitest';
import { buildStructuredWhiteboardContext, extendStructuredWhiteboardContext } from '@/lib/whiteboard/planner';
import type { DrawBatch, DrawElement, SemanticBatch } from '@/types/agent';

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

  it('advances suggested region across batches and resets on clear', () => {
    const base = buildStructuredWhiteboardContext([], []);
    const batch1: DrawBatch = {
      batch_id: 'b1',
      elements: [{ id: 'eq1', type: 'latex', x: 100, y: 120, tex: 'x^2+1=0', displayMode: true, fontSize: 24 }],
    };
    const next1 = extendStructuredWhiteboardContext(base, batch1);
    const y1 = next1.suggested_next_regions[0]?.y ?? 0;

    const batch2: DrawBatch = {
      batch_id: 'b2',
      elements: [{ id: 'eq2', type: 'latex', x: 100, y: 340, tex: 'x=\\pm i', displayMode: true, fontSize: 24 }],
    };
    const next2 = extendStructuredWhiteboardContext(next1, batch2);
    const y2 = next2.suggested_next_regions[0]?.y ?? 0;

    expect(y2).toBeGreaterThan(y1);
    expect(next2.scene_summary.element_count).toBe(2);

    const clearBatch: DrawBatch = {
      batch_id: 'clear',
      elements: [
        { id: 'clear-1', type: 'clear' },
        { id: 'caption-1', type: 'text', x: 80, y: 110, text: 'fresh start', size: 20 },
      ],
    };
    const next3 = extendStructuredWhiteboardContext(next2, clearBatch);
    expect(next3.scene_summary.element_count).toBe(1);
    expect(next3.scene_summary.type_counts.latex ?? 0).toBe(0);
    expect(next3.scene_summary.type_counts.text ?? 0).toBe(1);
  });

  it('output always includes token_budget_hint and non-empty suggested_next_regions', () => {
    // Empty scene — baseline
    const empty = buildStructuredWhiteboardContext([], []);
    expect(empty.token_budget_hint).toBeDefined();
    expect(typeof empty.token_budget_hint.max_chars).toBe('number');
    expect(empty.token_budget_hint.max_chars).toBeGreaterThan(0);
    expect(empty.suggested_next_regions.length).toBeGreaterThanOrEqual(1);
    expect(empty.suggested_next_regions[0]!.score).toBeGreaterThan(0);

    // Non-empty scene
    const scene: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 50, y: 50, w: 200, h: 100 },
    ];
    const populated = buildStructuredWhiteboardContext(scene, []);
    expect(populated.token_budget_hint.max_chars).toBeGreaterThan(0);
    expect(populated.suggested_next_regions.length).toBeGreaterThanOrEqual(1);
  });

  it('regression: clear batch resets suggested_next_regions to valid positive coordinates', () => {
    const base = buildStructuredWhiteboardContext([], []);
    const batch: DrawBatch = {
      batch_id: 'b-clear',
      elements: [
        { id: 'clear-1', type: 'clear' },
      ],
    };
    const afterClear = extendStructuredWhiteboardContext(base, batch);
    for (const region of afterClear.suggested_next_regions) {
      expect(region.y).toBeGreaterThan(0);
      expect(region.x).toBeGreaterThan(0);
      expect(region.w).toBeGreaterThan(0);
      expect(region.h).toBeGreaterThan(0);
    }
  });
});
