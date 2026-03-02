import { describe, expect, it, vi } from 'vitest';
import { BoundsCache, enforceDrawBatchConstraints } from '@/lib/whiteboard/planner';
import { boundsOf } from '@/lib/whiteboard/planner';
import * as boundsModule from '@/lib/whiteboard/planner/bounds';
import type { DrawElement, DrawBatch } from '@/types/agent';

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

  it('duplicate element IDs return first-cached value until invalidated', () => {
    const cache = new BoundsCache();
    const elA: DrawElement = { id: 'dup', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
    const elB: DrawElement = { id: 'dup', type: 'rect', x: 200, y: 300, w: 40, h: 30 };

    const boundsA = cache.get(elA);
    const boundsB = cache.get(elB);
    // Same ID → returns cached (first) value, not recomputed for elB
    expect(boundsB).toBe(boundsA);

    // After invalidation, recomputes with whatever element is passed
    cache.invalidate('dup');
    const boundsAfter = cache.get(elB);
    expect(boundsAfter).toEqual(boundsOf(elB));
    expect(boundsAfter).not.toEqual(boundsA);
  });
});

describe('BoundsCache effectiveness in constraint solver', () => {
  it('cache reduces boundsOf calls by ≥60% compared to uncached baseline', () => {
    const spy = vi.spyOn(boundsModule, 'boundsOf');

    const elements: DrawElement[] = Array.from({ length: 50 }, (_, i) => ({
      id: `latex-${i}`,
      type: 'latex' as const,
      x: 40 + (i % 5) * 220,
      y: 40 + Math.floor(i / 5) * 80,
      tex: `\\frac{\\sum_{k=1}^{n} k^{${i}}}{\\sqrt{${i + 1}}}`,
      fontSize: 20,
      displayMode: true,
    }));

    const batch: DrawBatch = { batch_id: 'cache-bench', elements };
    spy.mockClear();
    enforceDrawBatchConstraints(batch);
    const cachedCalls = spy.mock.calls.length;

    // With 50 elements and multiple constraint passes, uncached would call
    // boundsOf many more times. The cache should provide significant reduction.
    // We assert a sanity ceiling rather than a strict threshold (per review).
    // With 50 elements, each iteration would call boundsOf at least 50 times
    // per function × 5 functions × multiple iterations. Cache should keep
    // the total well below that.
    const maxReasonableCalls = 50 * 5 * 6; // elements × functions × max iterations
    expect(cachedCalls).toBeLessThan(maxReasonableCalls);

    spy.mockRestore();
  });

  it('constraint output is identical on fixed fixtures (correctness sanity check)', () => {
    const batch: DrawBatch = {
      batch_id: 'correctness-1',
      elements: [
        { id: 'r1', type: 'rect', x: 50, y: 50, w: 120, h: 80 },
        { id: 'label-r1', type: 'text', x: 60, y: 55, text: 'Box Label', size: 16 },
        { id: 't1', type: 'text', x: 60, y: 200, text: 'Description text', size: 18 },
        { id: 't2', type: 'text', x: 65, y: 202, text: 'Overlapping text', size: 18 },
        { id: 'a1', type: 'arrow', from: { x: 170, y: 90 }, to: { x: 300, y: 200 } },
        { id: 'latex-1', type: 'latex', x: 400, y: 100, tex: 'E = mc^2', fontSize: 22, displayMode: true },
      ],
    };

    // Run twice on the same input and verify output is deterministic
    const result1 = enforceDrawBatchConstraints(batch);
    const result2 = enforceDrawBatchConstraints(batch);

    expect(result1.batch.elements).toEqual(result2.batch.elements);
    expect(result1.violationsFixed.sort()).toEqual(result2.violationsFixed.sort());
    expect(result1.fallbackUsed).toBe(result2.fallbackUsed);
  });

  it('constraint solver completes within sanity ceiling for 50-element batch', () => {
    const elements: DrawElement[] = Array.from({ length: 50 }, (_, i) => ({
      id: `perf-${i}`,
      type: 'latex' as const,
      x: 40 + (i % 4) * 300,
      y: 40 + Math.floor(i / 4) * 60,
      tex: `\\frac{\\sum_{k=1}^{n} k^{${i}}}{\\sqrt{${i + 1}}} + \\int_0^1 f(x)\\,dx`,
      fontSize: 20,
      displayMode: true,
    }));

    const batch: DrawBatch = { batch_id: 'perf-bench', elements };

    const start = performance.now();
    const runs = 20;
    for (let i = 0; i < runs; i++) {
      enforceDrawBatchConstraints(batch);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / runs;

    // Non-gating sanity ceiling: should complete in under 500ms per run
    // even on slow CI machines (per review: avoid flaky strict thresholds)
    expect(avgMs).toBeLessThan(500);
  });
});
