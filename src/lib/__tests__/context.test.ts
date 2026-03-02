import { describe, it, expect } from 'vitest';
import { buildWhiteboardContext } from '../whiteboard/context';
import type { DrawElement } from '@/types/agent';

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
