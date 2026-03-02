import { describe, expect, it } from 'vitest';
import { BoundsCache } from '@/lib/whiteboard/planner';
import { boundsOf } from '@/lib/whiteboard/planner';
import type { DrawElement } from '@/types/agent';

describe('BoundsCache', () => {
  const rect: DrawElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
  const text: DrawElement = { id: 't1', type: 'text', x: 50, y: 100, text: 'hello' };

  it('get returns the same reference for repeated calls (cache hit)', () => {
    const cache = new BoundsCache();
    const first = cache.get(rect);
    const second = cache.get(rect);
    expect(first).toBe(second);
  });

  it('clear empties all entries, subsequent get recomputes', () => {
    const cache = new BoundsCache();
    const first = cache.get(rect);
    expect(first).not.toBeNull();
    cache.clear();
    const second = cache.get(rect);
    expect(second).not.toBeNull();
    // After clear + recompute, values should be equal but not the same reference
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('updateAfterShift on element with null bounds keeps it as null', () => {
    const cache = new BoundsCache();
    // Element with invalid geometry → null bounds
    const invalid: DrawElement = { id: 'bad', type: 'rect', x: 10, y: 20, w: 0, h: 50 };
    const b = cache.get(invalid);
    expect(b).toBeNull();

    cache.updateAfterShift('bad', 10, 20);

    // Should still have the entry as null, not deleted
    const after = cache.get(invalid);
    expect(after).toBeNull();
  });

  it('updateAfterShift correctly shifts cached bounds', () => {
    const cache = new BoundsCache();
    cache.get(rect); // populate cache
    cache.updateAfterShift('r1', 5, 10);
    const shifted = cache.get(rect);
    expect(shifted).toEqual({
      minX: 15,
      minY: 30,
      maxX: 115,
      maxY: 80,
    });
  });

  it('invalidate removes entry so next get recomputes fresh bounds', () => {
    const cache = new BoundsCache();
    const first = cache.get(text);
    cache.invalidate('t1');
    const second = cache.get(text);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('sequential updateAfterShift accumulates offsets', () => {
    const cache = new BoundsCache();
    cache.get(rect); // populate: minX=10, minY=20, maxX=110, maxY=70
    cache.updateAfterShift('r1', 5, 10);
    cache.updateAfterShift('r1', 5, 10);
    const shifted = cache.get(rect);
    expect(shifted).toEqual({
      minX: 20,
      minY: 40,
      maxX: 120,
      maxY: 90,
    });
  });

  it('updateAfterShift on non-cached element is a no-op', () => {
    const cache = new BoundsCache();
    // 'missing' was never cached
    expect(() => cache.updateAfterShift('missing', 10, 20)).not.toThrow();
  });
});
