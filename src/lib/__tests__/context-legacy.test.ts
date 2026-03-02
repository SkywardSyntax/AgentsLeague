import { describe, it, expect } from 'vitest';
import { buildWhiteboardContext, buildWhiteboardContextV2 } from '@/lib/whiteboard/context';
import { buildStructuredWhiteboardContext } from '@/lib/whiteboard/planner/context-v2';
import type { DrawElement } from '@/types/agent';

describe('buildWhiteboardContext (legacy v1)', () => {
  it('empty elements array returns zero counts, no bounds, empty recentElements, default origin', () => {
    const ctx = buildWhiteboardContext([]);
    expect(ctx.elementCount).toBe(0);
    expect(ctx.bounds).toBeUndefined();
    expect(ctx.elementTypeCounts).toEqual({});
    expect(ctx.recentElements).toEqual([]);
    expect(ctx.suggestedNextOrigin).toEqual({ x: 64, y: 96 });
  });

  it('single rect element produces correct count, bounds, and type counts', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.elementCount).toBe(1);
    expect(ctx.bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
    expect(ctx.elementTypeCounts).toEqual({ rect: 1 });
  });

  it('type counts accumulate correctly for mixed element types', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 50, h: 50 },
      { id: 'r2', type: 'rect', x: 100, y: 0, w: 50, h: 50 },
      { id: 't1', type: 'text', x: 0, y: 100, text: 'hello', size: 18 },
      { id: 'l1', type: 'latex', x: 0, y: 200, tex: 'x^2', displayMode: false, fontSize: 20 },
      { id: 'e1', type: 'ellipse', cx: 300, cy: 300, rx: 30, ry: 20 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.elementTypeCounts).toEqual({ rect: 2, text: 1, latex: 1, ellipse: 1 });
  });

  it('bounds merge across multiple elements', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 10, y: 10, w: 100, h: 50 },
      { id: 'e1', type: 'ellipse', cx: 200, cy: 200, rx: 30, ry: 20 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.bounds!.minX).toBe(10);
    expect(ctx.bounds!.minY).toBe(10);
    expect(ctx.bounds!.maxX).toBe(230); // 200+30
    expect(ctx.bounds!.maxY).toBe(220); // 200+20
  });

  it('recentElements returns last 10 elements when given more than 10', () => {
    const elements: DrawElement[] = Array.from({ length: 15 }, (_, i) => ({
      id: `r${i}`,
      type: 'rect' as const,
      x: i * 10,
      y: 0,
      w: 5,
      h: 5,
    }));
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.recentElements.length).toBe(10);
    expect(ctx.recentElements[0].id).toBe('r5');
  });

  it('textPreview for text element slices at 70 chars', () => {
    const longText = 'A'.repeat(100);
    const elements: DrawElement[] = [
      { id: 't1', type: 'text', x: 0, y: 0, text: longText, size: 18 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.recentElements[0].textPreview!.length).toBeLessThanOrEqual(70);
  });

  it('textPreview for latex element returns tex sliced at 70 chars', () => {
    const longTex = 'x'.repeat(100);
    const elements: DrawElement[] = [
      { id: 'l1', type: 'latex', x: 0, y: 0, tex: longTex, displayMode: false, fontSize: 20 },
    ];
    const ctx = buildWhiteboardContext(elements);
    expect(ctx.recentElements[0].textPreview!.length).toBeLessThanOrEqual(70);
  });

  it('textPreview for shape elements (rect, ellipse, line, arrow) is undefined', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 50, h: 50 },
      { id: 'e1', type: 'ellipse', cx: 100, cy: 100, rx: 20, ry: 20 },
      { id: 'ln1', type: 'line', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    ];
    const ctx = buildWhiteboardContext(elements);
    for (const el of ctx.recentElements) {
      expect(el.textPreview).toBeUndefined();
    }
  });

  it('suggestedNextOrigin is below scene bounds', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 50, y: 0, w: 100, h: 500 },
    ];
    const ctx = buildWhiteboardContext(elements);
    // maxY = 500, so suggestedNextOrigin.y = 500 + 72 = 572
    expect(ctx.suggestedNextOrigin.y).toBe(572);
    // x = max(56, minX + 10) = max(56, 60) = 60
    expect(ctx.suggestedNextOrigin.x).toBe(60);
  });

  it('buildWhiteboardContextV2 delegates to buildStructuredWhiteboardContext', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50 },
      { id: 't1', type: 'text', x: 10, y: 80, text: 'hello', size: 18 },
    ];
    const v2Result = buildWhiteboardContextV2(elements);
    const directResult = buildStructuredWhiteboardContext(elements);
    expect(v2Result.scene_summary.element_count).toBe(directResult.scene_summary.element_count);
  });
});
