import { describe, expect, it } from 'vitest';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '@/lib/whiteboard/context';
import type { DrawElement, SemanticBatch } from '@/types/agent';

describe('buildWhiteboardContext', () => {
  it('returns elementCount 0 and bounds undefined for empty array', () => {
    const ctx = buildWhiteboardContext([]);
    expect(ctx.elementCount).toBe(0);
    expect(ctx.bounds).toBeUndefined();
  });

  it('calculates bounds from a rect element', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('calculates bounds from an ellipse spanning cx±rx, cy±ry', () => {
    const elements: DrawElement[] = [
      { id: 'e1', type: 'ellipse', cx: 50, cy: 60, rx: 30, ry: 20 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.bounds).toEqual({ minX: 20, minY: 40, maxX: 80, maxY: 80 });
  });

  it('calculates bounds from a line using from and to points', () => {
    const elements: DrawElement[] = [
      { id: 'l1', type: 'line', from: { x: 5, y: 15 }, to: { x: 200, y: 100 } },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.bounds).toEqual({ minX: 5, minY: 15, maxX: 200, maxY: 100 });
  });

  it('counts element types correctly for mixed elements', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
      { id: 'r2', type: 'rect', x: 20, y: 20, w: 10, h: 10 },
      { id: 'e1', type: 'ellipse', cx: 50, cy: 50, rx: 5, ry: 5 },
      { id: 'l1', type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.elementTypeCounts).toEqual({ rect: 2, ellipse: 1, line: 1 });
    expect(ctx.elementCount).toBe(4);
  });

  it('suggestedNextOrigin is below the lowest element', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 100, y: 200, w: 50, h: 80 },
    ];
    const ctx = buildWhiteboardContext(elements);
    // maxY = 200 + 80 = 280, suggestedNextOrigin.y = 280 + 72 = 352
    expect(ctx.suggestedNextOrigin.y).toBe(352);
    expect(ctx.suggestedNextOrigin.y).toBeGreaterThan(ctx.bounds!.maxY);
  });
});

describe('buildWhiteboardContextV2', () => {
  it('returns StructuredWhiteboardContext with scene summary from semanticScene', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 100 },
    ];
    const semanticScene: SemanticBatch[] = [
      {
        batch_id: 'sb1',
        template: 'freeform_semantic',
        blocks: [
          { id: 'cap1', kind: 'caption', text: 'Hello world' },
        ],
      },
    ];
    const ctx = buildWhiteboardContextV2(elements, semanticScene);
    expect(ctx.scene_summary.element_count).toBe(1);
    expect(ctx.scene_summary.type_counts.rect).toBe(1);
    expect(ctx.suggested_next_regions.length).toBeGreaterThan(0);
    expect(ctx.recent_blocks.length).toBeGreaterThan(0);
  });
});
