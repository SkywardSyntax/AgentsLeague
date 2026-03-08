import { describe, expect, it } from 'vitest';
import { extendStructuredWhiteboardContext } from '@/lib/whiteboard/planner';
import type { DrawBatch, StructuredWhiteboardContext, SemanticBatch } from '@/types/agent';

describe('extendStructuredWhiteboardContext null/empty edge paths', () => {
  it('undefined context + empty elements batch returns valid defaults', () => {
    const batch: DrawBatch = { batch_id: 'b1', elements: [] };
    const result = extendStructuredWhiteboardContext(undefined, batch);

    expect(result.scene_summary.element_count).toBe(0);
    expect(result.scene_summary.bounds).toBeUndefined();
    expect(result.suggested_next_regions.length).toBeGreaterThan(0);
    expect(result.token_budget_hint.max_chars).toBe(2200);
    expect(result.occupied_regions).toEqual([]);
    expect(result.anchors).toEqual([]);
  });

  it('undefined context + clear-only batch resets counts without crash', () => {
    const batch: DrawBatch = {
      batch_id: 'b2',
      elements: [{ id: 'c1', type: 'clear' }],
    };
    const result = extendStructuredWhiteboardContext(undefined, batch);

    expect(result.scene_summary.element_count).toBe(0);
    expect(result.scene_summary.bounds).toBeUndefined();
    expect(result.occupied_regions).toEqual([]);
    expect(result.anchors).toEqual([]);
    expect(result.recent_blocks).toEqual([]);
  });

  it('context with falsy max_chars resets to default 2200', () => {
    const ctx: StructuredWhiteboardContext = {
      scene_summary: { element_count: 1, type_counts: { text: 1 }, element_type_summary: { text: 1 }, math_context: 'empty', suggested_drawing_style: 'clean' },
      occupied_regions: [],
      anchors: [],
      recent_blocks: [],
      suggested_next_regions: [],
      token_budget_hint: { max_chars: 0 },
    };
    const batch: DrawBatch = { batch_id: 'b3', elements: [] };
    const result = extendStructuredWhiteboardContext(ctx, batch);

    expect(result.token_budget_hint.max_chars).toBe(2200);
  });

  it('context bounds are cloned, not mutated', () => {
    const originalBounds = { minX: 10, minY: 20, maxX: 110, maxY: 120 };
    const ctx: StructuredWhiteboardContext = {
      scene_summary: {
        element_count: 1,
        bounds: originalBounds,
        type_counts: { rect: 1 },
        element_type_summary: { rect: 1 },
        math_context: 'has_geometry',
        suggested_drawing_style: 'sketch',
      },
      occupied_regions: [],
      anchors: [],
      recent_blocks: [],
      suggested_next_regions: [],
      token_budget_hint: { max_chars: 2200 },
    };
    const batch: DrawBatch = {
      batch_id: 'b4',
      elements: [{ id: 'r1', type: 'rect', x: 500, y: 500, w: 100, h: 100 }],
    };
    extendStructuredWhiteboardContext(ctx, batch);

    expect(originalBounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 120 });
  });

  it('semantic batch recent_blocks are appended after element recent_blocks', () => {
    const batch: DrawBatch = {
      batch_id: 'b5',
      elements: [{ id: 't1', type: 'text', x: 0, y: 0, text: 'hello world' }],
    };
    const semanticBatch: SemanticBatch = {
      batch_id: 'sb5',
      template: 'freeform_semantic',
      blocks: [{ id: 'cap1', kind: 'caption', text: 'A caption block' }],
    };
    const result = extendStructuredWhiteboardContext(undefined, batch, semanticBatch);

    expect(result.recent_blocks.length).toBeGreaterThanOrEqual(2);
    const lastBlock = result.recent_blocks[result.recent_blocks.length - 1];
    expect(lastBlock.id).toBe('sb5:cap1');
    expect(lastBlock.kind).toBe('caption');

    const elementBlock = result.recent_blocks.find((b) => b.id === 'b5:t1');
    expect(elementBlock).toBeDefined();
    const elemIdx = result.recent_blocks.indexOf(elementBlock!);
    const semIdx = result.recent_blocks.indexOf(lastBlock);
    expect(elemIdx).toBeLessThan(semIdx);
  });
});
