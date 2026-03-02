import { describe, it, expect } from 'vitest';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '../whiteboard/context';
import { StructuredWhiteboardContextSchema } from '../schema';
import type { DrawElement, SemanticBatch } from '@/types/agent';

describe('buildWhiteboardContext', () => {
  it('returns zero counts for empty scene', () => {
    const ctx = buildWhiteboardContext([]);
    expect(ctx.elementCount).toBe(0);
    expect(ctx.bounds).toBeUndefined();
    expect(ctx.elementTypeCounts).toEqual({});
    expect(ctx.recentElements).toEqual([]);
  });

  it('computes bounds for mixed elements', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 100, y: 100, w: 200, h: 120 },
      { id: 'e1', type: 'ellipse', cx: 500, cy: 300, rx: 50, ry: 30 },
      { id: 'l1', type: 'line', from: { x: 10, y: 10 }, to: { x: 400, y: 400 } },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.bounds).toBeDefined();
    expect(ctx.bounds!.minX).toBe(10);
    expect(ctx.bounds!.minY).toBe(10);
    expect(ctx.bounds!.maxX).toBe(550); // ellipse cx + rx
    expect(ctx.bounds!.maxY).toBe(400);
  });

  it('suggestedNextOrigin is below existing content', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 100, y: 100, w: 200, h: 120 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.suggestedNextOrigin.y).toBeGreaterThan(100 + 120); // below rect bottom
  });

  it('recentElements slices last 10', () => {
    const elements: DrawElement[] = Array.from({ length: 15 }, (_, i) => ({
      id: `r${i}`,
      type: 'rect' as const,
      x: i * 10,
      y: i * 10,
      w: 50,
      h: 50,
    }));
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.recentElements).toHaveLength(10);
    expect(ctx.recentElements[0].id).toBe('r5');
    expect(ctx.recentElements[9].id).toBe('r14');
  });

  it('textPreview extracts text content', () => {
    const elements: DrawElement[] = [
      { id: 't1', type: 'text', x: 0, y: 0, text: 'Hello World', size: 16 },
      { id: 'x1', type: 'latex', x: 0, y: 50, tex: 'E = mc^2', fontSize: 20 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.recentElements[0].textPreview).toBe('Hello World');
    expect(ctx.recentElements[1].textPreview).toBe('E = mc^2');
  });

  it('elementTypeCounts aggregates correctly', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
      { id: 'r2', type: 'rect', x: 20, y: 20, w: 10, h: 10 },
      { id: 'e1', type: 'ellipse', cx: 100, cy: 100, rx: 10, ry: 10 },
      { id: 't1', type: 'text', x: 0, y: 0, text: 'test', size: 12 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.elementTypeCounts).toEqual({
      rect: 2,
      ellipse: 1,
      text: 1,
    });
    expect(ctx.elementCount).toBe(4);
  });

  it('handles clear elements (no bounds contribution)', () => {
    const elements: DrawElement[] = [
      { id: 'c1', type: 'clear' },
      { id: 'r1', type: 'rect', x: 50, y: 50, w: 100, h: 100 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.elementCount).toBe(2);
    expect(ctx.elementTypeCounts['clear']).toBe(1);
    expect(ctx.bounds!.minX).toBe(50);
  });

  it('handles arrow element bounds', () => {
    const elements: DrawElement[] = [
      { id: 'a1', type: 'arrow', from: { x: 10, y: 20 }, to: { x: 300, y: 400 } },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.bounds!.minX).toBe(10);
    expect(ctx.bounds!.minY).toBe(20);
    expect(ctx.bounds!.maxX).toBe(300);
    expect(ctx.bounds!.maxY).toBe(400);
  });

  it('textPreview is undefined for non-text elements', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.recentElements[0].textPreview).toBeUndefined();
  });
});

describe('buildWhiteboardContextV2', () => {
  const sceneFixture: DrawElement[] = [
    { id: 'a1', type: 'arrow', from: { x: 100, y: 120 }, to: { x: 320, y: 120 } },
    { id: 'eq1', type: 'latex', x: 110, y: 220, tex: 'x^2+1=0', displayMode: true, fontSize: 24 },
    { id: 'r1', type: 'rect', x: 50, y: 50, w: 200, h: 100 },
  ];

  const semanticFixture: SemanticBatch[] = [
    {
      batch_id: 'sem-1',
      template: 'equation_derivation_vertical',
      blocks: [
        { id: 'eq', kind: 'equation_stack', lines: [{ id: 'l1', tex: 'x^2+1=0' }] },
      ],
    },
  ];

  it('output passes StructuredWhiteboardContextSchema validation', () => {
    const ctx = buildWhiteboardContextV2(sceneFixture, semanticFixture);
    const result = StructuredWhiteboardContextSchema.safeParse(ctx);
    expect(result.success).toBe(true);
  });

  it('with semantic scene includes occupied_regions', () => {
    const ctx = buildWhiteboardContextV2(sceneFixture, semanticFixture);
    expect(ctx.occupied_regions.length).toBeGreaterThan(0);
    const kinds = ctx.occupied_regions.map((r) => r.semantic_kind);
    expect(kinds).toContain('arrow');
    expect(kinds).toContain('latex');
    expect(kinds).toContain('rect');
  });

  it('with empty scene produces valid default regions', () => {
    const ctx = buildWhiteboardContextV2([], []);
    const result = StructuredWhiteboardContextSchema.safeParse(ctx);
    expect(result.success).toBe(true);
    expect(ctx.scene_summary.element_count).toBe(0);
    expect(ctx.suggested_next_regions.length).toBeGreaterThan(0);
    expect(ctx.occupied_regions).toHaveLength(0);
  });

  it('handles malformed semantic scene entries gracefully', () => {
    const malformed: SemanticBatch[] = [
      {
        batch_id: 'bad-1',
        template: 'freeform_semantic',
        blocks: [],
      },
    ];
    const ctx = buildWhiteboardContextV2(sceneFixture, malformed);
    const result = StructuredWhiteboardContextSchema.safeParse(ctx);
    expect(result.success).toBe(true);
    // Empty blocks batch produces no recent_blocks from semantic path
    // Falls back to element-based recent blocks
    expect(ctx.scene_summary.element_count).toBe(3);
  });

  it('elements with NaN coordinates do not throw', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: NaN, y: NaN, w: 100, h: 50 },
      { id: 'r2', type: 'rect', x: 50, y: 50, w: 200, h: 100 },
    ];
    // NaN propagates into bounds — function should not throw
    expect(() => buildWhiteboardContextV2(elements, [])).not.toThrow();
    const ctx = buildWhiteboardContextV2(elements, []);
    expect(ctx.scene_summary.element_count).toBe(2);
    expect(ctx.occupied_regions.length).toBeGreaterThan(0);
  });

  it('suggested_next_regions has deterministic ordering', () => {
    const ctx1 = buildWhiteboardContextV2(sceneFixture, semanticFixture);
    const ctx2 = buildWhiteboardContextV2(sceneFixture, semanticFixture);
    expect(ctx1.suggested_next_regions).toEqual(ctx2.suggested_next_regions);
    // Scores are descending
    for (let i = 1; i < ctx1.suggested_next_regions.length; i++) {
      expect(ctx1.suggested_next_regions[i - 1]!.score).toBeGreaterThanOrEqual(
        ctx1.suggested_next_regions[i]!.score,
      );
    }
  });
});
