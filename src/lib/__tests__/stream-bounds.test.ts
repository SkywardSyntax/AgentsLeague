import { describe, it, expect } from 'vitest';
import { boundsOfElementInBatch, boundsOfBatch } from '@/lib/server/stream/bounds';
import type { DrawBatch } from '@/types/agent';

describe('boundsOfElementInBatch', () => {
  it('computes rect bounds', () => {
    const b = boundsOfElementInBatch({ id: 'r', type: 'rect', x: 10, y: 20, w: 100, h: 50 });
    expect(b).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('computes ellipse bounds', () => {
    const b = boundsOfElementInBatch({ id: 'e', type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 });
    expect(b).toEqual({ minX: 20, minY: 30, maxX: 80, maxY: 70 });
  });

  it('computes line bounds', () => {
    const b = boundsOfElementInBatch({ id: 'l', type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 50 } });
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
  });

  it('computes arrow bounds', () => {
    const b = boundsOfElementInBatch({ id: 'a', type: 'arrow', from: { x: 50, y: 50 }, to: { x: 10, y: 10 } });
    expect(b).toEqual({ minX: 10, minY: 10, maxX: 50, maxY: 50 });
  });

  it('computes text bounds', () => {
    const b = boundsOfElementInBatch({ id: 't', type: 'text', x: 10, y: 20, text: 'Hello' });
    expect(b).not.toBeNull();
    expect(b!.minX).toBe(10);
    expect(b!.maxX).toBeGreaterThan(10);
  });

  it('computes latex bounds', () => {
    const b = boundsOfElementInBatch({ id: 'x', type: 'latex', x: 10, y: 20, tex: '\\frac{1}{2}' });
    expect(b).not.toBeNull();
    expect(b!.minX).toBe(10);
    expect(b!.maxY).toBeGreaterThan(20);
  });

  it('returns null for clear element', () => {
    expect(boundsOfElementInBatch({ id: 'c', type: 'clear' })).toBeNull();
  });

  it('handles multi-line text', () => {
    const b = boundsOfElementInBatch({ id: 't', type: 'text', x: 10, y: 20, text: 'Line 1\nLine 2\nLine 3' });
    expect(b).not.toBeNull();
    // Height should account for 3 lines
    const size = 18;
    const expectedHeight = 3 * size * 1.3;
    expect(b!.maxY - b!.minY).toBeCloseTo(expectedHeight, 1);
  });

  it('caps text width at 1200', () => {
    const longText = 'A'.repeat(500);
    const b = boundsOfElementInBatch({ id: 't', type: 'text', x: 0, y: 100, text: longText, size: 18 });
    expect(b).not.toBeNull();
    expect(b!.maxX - b!.minX).toBeLessThanOrEqual(1200);
  });

  it('single-line short text width unchanged', () => {
    const b = boundsOfElementInBatch({ id: 't', type: 'text', x: 0, y: 100, text: 'Hi', size: 18 });
    expect(b).not.toBeNull();
    const size = 18;
    const expectedWidth = Math.max(size * 0.45, 2 * size * 0.52);
    expect(b!.maxX - b!.minX).toBeCloseTo(expectedWidth, 5);
  });
});

describe('boundsOfBatch', () => {
  it('returns null for empty batch', () => {
    const batch: DrawBatch = { batch_id: 'b1', elements: [] };
    expect(boundsOfBatch(batch)).toBeNull();
  });

  it('merges bounds from multiple elements', () => {
    const batch: DrawBatch = {
      batch_id: 'b1',
      elements: [
        { id: 'r1', type: 'rect', x: 0, y: 0, w: 50, h: 50 },
        { id: 'r2', type: 'rect', x: 100, y: 100, w: 50, h: 50 },
      ],
    };
    const b = boundsOfBatch(batch);
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 150, maxY: 150 });
  });

  it('ignores clear elements', () => {
    const batch: DrawBatch = {
      batch_id: 'b1',
      elements: [
        { id: 'c', type: 'clear' },
        { id: 'r', type: 'rect', x: 10, y: 10, w: 20, h: 20 },
      ],
    };
    const b = boundsOfBatch(batch);
    expect(b).toEqual({ minX: 10, minY: 10, maxX: 30, maxY: 30 });
  });
});
