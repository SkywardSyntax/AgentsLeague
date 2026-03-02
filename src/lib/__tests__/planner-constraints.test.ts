import { describe, expect, it } from 'vitest';
import { enforceDrawBatchConstraints, BoundsCache } from '@/lib/whiteboard/planner';
import type { DrawBatch, DrawElement } from '@/types/agent';

describe('planner constraints', () => {
  it('repairs overlapping text blocks', () => {
    const batch: DrawBatch = {
      batch_id: 'b1',
      elements: [
        { id: 't1', type: 'text', x: 40, y: 100, text: 'line one', size: 22 },
        { id: 't2', type: 'text', x: 45, y: 102, text: 'line two', size: 22 },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch);
    const t1 = repaired.batch.elements[0]!;
    const t2 = repaired.batch.elements[1]!;

    expect(t1.type).toBe('text');
    expect(t2.type).toBe('text');
    if (t1.type !== 'text' || t2.type !== 'text') return;

    expect(t2.y).toBeGreaterThan(t1.y + 8);
    expect(repaired.violationsFixed.length).toBeGreaterThan(0);
    expect(repaired.violationsFixed.some(v => v.includes('shift'))).toBe(true);
  });

  it('clamps elements back into canvas bounds', () => {
    const batch: DrawBatch = {
      batch_id: 'b2',
      elements: [{ id: 'r1', type: 'rect', x: -120, y: -80, w: 150, h: 100 }],
    };

    const repaired = enforceDrawBatchConstraints(batch, {
      canvasWidth: 800,
      canvasHeight: 600,
      margin: 20,
    });

    const rect = repaired.batch.elements[0]!;
    expect(rect.type).toBe('rect');
    if (rect.type !== 'rect') return;

    expect(rect.x).toBeGreaterThanOrEqual(20);
    expect(rect.y).toBeGreaterThanOrEqual(20);
    expect(repaired.violationsFixed.some(v => v.includes('shift'))).toBe(true);
  });

  it('handles oversized elements without contradictory corrections', () => {
    const batch: DrawBatch = {
      batch_id: 'b3',
      elements: [{ id: 'r1', type: 'rect', x: -10, y: 30, w: 900, h: 50 }],
    };

    const repaired = enforceDrawBatchConstraints(batch, {
      canvasWidth: 800,
      canvasHeight: 600,
      margin: 20,
    });

    const rect = repaired.batch.elements[0]!;
    expect(rect.type).toBe('rect');
    if (rect.type !== 'rect') return;

    // Oversized element should be clamped to left margin, not pushed both ways
    expect(rect.x).toBe(20);
  });

  it('fallback reflow preserves two-column structure', () => {
    // Two columns of text that overlap within each column
    const batch: DrawBatch = {
      batch_id: 'b4',
      elements: [
        { id: 'left-1', type: 'text', x: 50, y: 100, text: 'left column line one', size: 18 },
        { id: 'left-2', type: 'text', x: 55, y: 101, text: 'left column line two', size: 18 },
        { id: 'right-1', type: 'text', x: 600, y: 100, text: 'right column line one', size: 18 },
        { id: 'right-2', type: 'text', x: 605, y: 101, text: 'right column line two', size: 18 },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch, {
      canvasWidth: 1600,
      canvasHeight: 1200,
      margin: 24,
      maxRepairIterations: 0, // force fallback
    });

    // After fallback reflow, left-column elements should still be
    // spatially separated from right-column elements
    const leftEls = repaired.batch.elements.filter(
      (el) => el.type === 'text' && el.id.startsWith('left'),
    );
    const rightEls = repaired.batch.elements.filter(
      (el) => el.type === 'text' && el.id.startsWith('right'),
    );
    expect(leftEls.length).toBe(2);
    expect(rightEls.length).toBe(2);

    // Right-column x positions should remain distinct from left-column
    for (const r of rightEls) {
      if (r.type === 'text') {
        for (const l of leftEls) {
          if (l.type === 'text') {
            expect(r.x).toBeGreaterThan(l.x + 100);
          }
        }
      }
    }
  });

  it('resolves overlapping rect shapes by shifting later one down', () => {
    const batch: DrawBatch = {
      batch_id: 'b5',
      elements: [
        { id: 'r1', type: 'rect', x: 100, y: 100, w: 200, h: 120 },
        { id: 'r2', type: 'rect', x: 120, y: 110, w: 200, h: 120 },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch);
    const r1 = repaired.batch.elements.find((el) => el.id === 'r1')!;
    const r2 = repaired.batch.elements.find((el) => el.id === 'r2')!;

    expect(r1.type).toBe('rect');
    expect(r2.type).toBe('rect');
    if (r1.type !== 'rect' || r2.type !== 'rect') return;

    // After resolving, r2 should not overlap r1 vertically
    expect(r2.y).toBeGreaterThanOrEqual(r1.y + r1.h);
  });

  it('does not resolve spacing for line/arrow elements as area shapes', () => {
    const batch: DrawBatch = {
      batch_id: 'b6',
      elements: [
        { id: 'line1', type: 'line', from: { x: 100, y: 100 }, to: { x: 300, y: 100 } },
        { id: 'line2', type: 'line', from: { x: 100, y: 100 }, to: { x: 300, y: 100 } },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch);
    const l1 = repaired.batch.elements.find((el) => el.id === 'line1')!;
    const l2 = repaired.batch.elements.find((el) => el.id === 'line2')!;

    expect(l1.type).toBe('line');
    expect(l2.type).toBe('line');
    if (l1.type !== 'line' || l2.type !== 'line') return;

    // Lines should NOT be shifted apart by resolveShapeSpacing
    expect(l2.from.y).toBe(l1.from.y);
    expect(repaired.violationsFixed).not.toContain('shape_spacing');
  });

  it('enforceArrowLegibility lengthens arrows shorter than minimum visible length', () => {
    const batch: DrawBatch = {
      batch_id: 'arrow-short',
      elements: [
        { id: 'a1', type: 'arrow', from: { x: 100, y: 100 }, to: { x: 103, y: 104 } },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch);
    const arrow = repaired.batch.elements.find((el) => el.id === 'a1')!;
    expect(arrow.type).toBe('arrow');
    if (arrow.type !== 'arrow') return;

    const len = Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y);
    expect(len).toBeGreaterThanOrEqual(28);
    expect(repaired.violationsFixed).toContain('arrow_endpoint_adjust');
  });

  it('enforceArrowLegibility handles zero-length arrow with from === to', () => {
    const batch: DrawBatch = {
      batch_id: 'arrow-zero',
      elements: [
        { id: 'a1', type: 'arrow', from: { x: 200, y: 200 }, to: { x: 200, y: 200 } },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch);
    const arrow = repaired.batch.elements.find((el) => el.id === 'a1')!;
    expect(arrow.type).toBe('arrow');
    if (arrow.type !== 'arrow') return;

    const len = Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y);
    expect(len).toBeGreaterThanOrEqual(28);
    // Zero-length defaults to horizontal unit vector (1, 0)
    expect(arrow.to.x).toBeCloseTo(200 + 28);
    expect(arrow.to.y).toBeCloseTo(200);
  });

  it('resolveLabelShapeSpacing pushes text labels outside overlapping shapes', () => {
    const batch: DrawBatch = {
      batch_id: 'label-overlap',
      elements: [
        { id: 'r1', type: 'rect', x: 100, y: 100, w: 200, h: 150 },
        { id: 'label-1', type: 'text', x: 120, y: 130, text: 'Label text', size: 18 },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch);
    const rect = repaired.batch.elements.find((el) => el.id === 'r1')!;
    const label = repaired.batch.elements.find((el) => el.id === 'label-1')!;

    expect(rect.type).toBe('rect');
    expect(label.type).toBe('text');
    if (rect.type !== 'rect' || label.type !== 'text') return;

    // Label should be pushed below the rect
    expect(label.y).toBeGreaterThanOrEqual(rect.y + rect.h);
  });

  it('fixed-point convergence stops early with no violations for clean batch', () => {
    const batch: DrawBatch = {
      batch_id: 'clean',
      elements: [
        { id: 't1', type: 'text', x: 50, y: 50, text: 'first', size: 18 },
        { id: 't2', type: 'text', x: 50, y: 200, text: 'second', size: 18 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    expect(result.violationsFixed).toHaveLength(0);
    expect(result.fallbackUsed).toBe(false);
  });

  // --- hasTextOverlap exercised via public API ---

  it('detects text-text overlap above 12px horizontal and any vertical overlap', () => {
    // Two text elements with >12px horizontal overlap and same Y → overlap detected, repair runs
    const batch: DrawBatch = {
      batch_id: 'overlap-detect',
      elements: [
        { id: 't1', type: 'text', x: 100, y: 100, text: 'hello world', size: 18 },
        { id: 't2', type: 'text', x: 105, y: 100, text: 'goodbye world', size: 18 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    // If overlap was detected, the constraint fixer must have shifted elements
    expect(result.violationsFixed.length).toBeGreaterThan(0);
    const t1 = result.batch.elements.find((el) => el.id === 't1')!;
    const t2 = result.batch.elements.find((el) => el.id === 't2')!;
    if (t1.type === 'text' && t2.type === 'text') {
      expect(Math.abs(t1.y - t2.y)).toBeGreaterThan(5);
    }
  });

  it('does not fix text overlap when horizontal overlap is less than 12px', () => {
    // Place two text elements so their bounds overlap less than 12px horizontally
    const batch: DrawBatch = {
      batch_id: 'no-overlap',
      elements: [
        { id: 't1', type: 'text', x: 100, y: 100, text: 'A', size: 18 },
        { id: 't2', type: 'text', x: 200, y: 100, text: 'B', size: 18 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    // Disjoint text → no shift needed, no fallback
    expect(result.fallbackUsed).toBe(false);
  });

  it('single text element triggers no overlap fix', () => {
    const batch: DrawBatch = {
      batch_id: 'single',
      elements: [
        { id: 't1', type: 'text', x: 100, y: 100, text: 'alone', size: 18 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    expect(result.fallbackUsed).toBe(false);
    expect(result.violationsFixed).toHaveLength(0);
  });

  it('shiftElement on unknown element type via constraints does not crash', () => {
    // ClearElement has type 'clear' which shiftElement returns unchanged
    const batch: DrawBatch = {
      batch_id: 'unknown-type',
      elements: [
        { id: 'c1', type: 'clear' },
        { id: 't1', type: 'text', x: 50, y: 50, text: 'hello', size: 18 },
      ],
    };

    // Should not throw
    const result = enforceDrawBatchConstraints(batch);
    expect(result.batch.elements.length).toBeGreaterThanOrEqual(1);
  });

  it('arrow at exactly 22px length is not modified', () => {
    // Arrow with length exactly 22px should pass legibility check
    const batch: DrawBatch = {
      batch_id: 'arrow-exact',
      elements: [
        { id: 'a1', type: 'arrow', from: { x: 100, y: 100 }, to: { x: 122, y: 100 } },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const arrow = result.batch.elements.find((el) => el.id === 'a1')!;
    expect(arrow.type).toBe('arrow');
    if (arrow.type === 'arrow') {
      // 22px is at the threshold so it should NOT be adjusted
      expect(arrow.to.x).toBeCloseTo(122);
      expect(arrow.to.y).toBeCloseTo(100);
    }
    expect(result.violationsFixed).not.toContain('arrow_endpoint_adjust');
  });

  it('arrow at 21px is extended to 28px', () => {
    const batch: DrawBatch = {
      batch_id: 'arrow-21',
      elements: [
        { id: 'a1', type: 'arrow', from: { x: 100, y: 100 }, to: { x: 121, y: 100 } },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const arrow = result.batch.elements.find((el) => el.id === 'a1')!;
    expect(arrow.type).toBe('arrow');
    if (arrow.type === 'arrow') {
      const len = Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y);
      expect(len).toBeCloseTo(28);
    }
    expect(result.violationsFixed).toContain('arrow_endpoint_adjust');
  });
});

describe('BoundsCache', () => {
  const rect: DrawElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };

  it('get() caches and returns same reference on second call', () => {
    const cache = new BoundsCache();
    const first = cache.get(rect);
    const second = cache.get(rect);
    expect(first).toBe(second);
    expect(first).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('invalidate() forces recomputation on next get()', () => {
    const cache = new BoundsCache();
    const first = cache.get(rect);
    cache.invalidate('r1');
    const second = cache.get(rect);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('clear() empties entire cache', () => {
    const cache = new BoundsCache();
    cache.get(rect);
    const rect2: DrawElement = { id: 'r2', type: 'rect', x: 0, y: 0, w: 50, h: 50 };
    cache.get(rect2);
    cache.clear();
    const fresh = cache.get(rect);
    expect(fresh).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('updateAfterShift() adjusts cached bounds by dx/dy', () => {
    const cache = new BoundsCache();
    cache.get(rect);
    cache.updateAfterShift('r1', 5, -3);
    const updated = cache.get(rect);
    expect(updated).toEqual({ minX: 15, minY: 17, maxX: 115, maxY: 67 });
  });

  it('updateAfterShift() on non-cached id is a no-op', () => {
    const cache = new BoundsCache();
    cache.updateAfterShift('nonexistent', 10, 10);
  });

  it('updateAfterShift() on null-bounds entry stays null', () => {
    const cache = new BoundsCache();
    const clearEl: DrawElement = { id: 'c1', type: 'clear' };
    const bounds = cache.get(clearEl);
    expect(bounds).toBeNull();
    cache.updateAfterShift('c1', 5, 5);
    const afterShift = cache.get(clearEl);
    expect(afterShift).toBeNull();
  });
});

describe('enforceDrawBatchConstraints with default config', () => {
  it('returns batch unchanged with empty fixes for a clean batch', () => {
    const batch: DrawBatch = {
      batch_id: 'default-clean',
      elements: [
        { id: 'r1', type: 'rect', x: 100, y: 100, w: 200, h: 100 },
      ],
    };
    const result = enforceDrawBatchConstraints(batch);
    expect(result.violationsFixed).toHaveLength(0);
    expect(result.fallbackUsed).toBe(false);
    expect(result.batch.batch_id).toBe('default-clean');
    const el = result.batch.elements[0]!;
    if (el.type === 'rect') {
      expect(el.x).toBe(100);
      expect(el.y).toBe(100);
    }
  });

  it('shifts out-of-bounds element using default canvas dimensions', () => {
    const batch: DrawBatch = {
      batch_id: 'default-oob',
      elements: [
        { id: 'r1', type: 'rect', x: 1550, y: 1150, w: 100, h: 80 },
      ],
    };
    const result = enforceDrawBatchConstraints(batch);
    const el = result.batch.elements[0]!;
    expect(el.type).toBe('rect');
    if (el.type === 'rect') {
      expect(el.x + el.w).toBeLessThanOrEqual(1600 - 24);
      expect(el.y + el.h).toBeLessThanOrEqual(1200 - 24);
    }
    expect(result.violationsFixed.length).toBeGreaterThan(0);
  });

  it('partial config override merges with defaults', () => {
    const batch: DrawBatch = {
      batch_id: 'partial-cfg',
      elements: [
        { id: 'r1', type: 'rect', x: 50, y: 50, w: 100, h: 80 },
      ],
    };
    const result = enforceDrawBatchConstraints(batch, { canvasWidth: 400 });
    expect(result.batch.batch_id).toBe('partial-cfg');
    expect(result.violationsFixed).toHaveLength(0);
  });
});

describe('NaN/Infinity guards', () => {
  it('does not propagate NaN from degenerate latex element through constraints', () => {
    const batch: DrawBatch = {
      batch_id: 'nan-test',
      elements: [
        { id: 'l1', type: 'latex', x: 100, y: 100, tex: '', displayMode: true },
        { id: 't1', type: 'text', x: 100, y: 200, text: 'valid text', size: 18 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    for (const el of result.batch.elements) {
      if (el.type === 'text') {
        expect(Number.isFinite(el.x)).toBe(true);
        expect(Number.isFinite(el.y)).toBe(true);
      }
      if (el.type === 'latex') {
        expect(Number.isFinite(el.x)).toBe(true);
        expect(Number.isFinite(el.y)).toBe(true);
      }
    }
  });

  it('handles Infinity coordinates on arrow endpoints without crashing', () => {
    const batch: DrawBatch = {
      batch_id: 'inf-arrow',
      elements: [
        { id: 'a1', type: 'arrow', from: { x: Infinity, y: 100 }, to: { x: 200, y: 100 } },
        { id: 't1', type: 'text', x: 100, y: 300, text: 'safe text', size: 18 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const text = result.batch.elements.find((el) => el.id === 't1')!;
    expect(text.type).toBe('text');
    if (text.type === 'text') {
      expect(Number.isFinite(text.x)).toBe(true);
      expect(Number.isFinite(text.y)).toBe(true);
    }
  });

  it('handles -Infinity coordinates on line endpoints', () => {
    const batch: DrawBatch = {
      batch_id: 'neg-inf-line',
      elements: [
        { id: 'l1', type: 'line', from: { x: 100, y: -Infinity }, to: { x: 200, y: 200 } },
        { id: 'r1', type: 'rect', x: 100, y: 100, w: 50, h: 50 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    for (const el of result.batch.elements) {
      if (el.type === 'rect') {
        expect(Number.isFinite(el.x)).toBe(true);
        expect(Number.isFinite(el.y)).toBe(true);
      }
    }
  });

  it('resolves identical-position overlap without producing NaN', () => {
    const batch: DrawBatch = {
      batch_id: 'identical-pos',
      elements: [
        { id: 't1', type: 'text', x: 100, y: 100, text: 'block A', size: 18 },
        { id: 't2', type: 'text', x: 100, y: 100, text: 'block B', size: 18 },
        { id: 'r1', type: 'rect', x: 100, y: 100, w: 80, h: 40 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const t1 = result.batch.elements.find((el) => el.id === 't1')!;
    const t2 = result.batch.elements.find((el) => el.id === 't2')!;
    expect(t1.type).toBe('text');
    expect(t2.type).toBe('text');
    if (t1.type === 'text' && t2.type === 'text') {
      expect(Number.isFinite(t1.x)).toBe(true);
      expect(Number.isFinite(t1.y)).toBe(true);
      expect(Number.isFinite(t2.x)).toBe(true);
      expect(Number.isFinite(t2.y)).toBe(true);
      // Overlap resolver must separate them by at least minTextGap (14)
      expect(Math.abs(t2.y - t1.y)).toBeGreaterThanOrEqual(14);
    }
  });

  it('BoundsCache.updateAfterShift ignores NaN shift values', () => {
    const cache = new BoundsCache();
    const rect: DrawElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
    cache.get(rect);
    cache.updateAfterShift('r1', NaN, 5);
    const bounds = cache.get(rect);
    expect(bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('BoundsCache.updateAfterShift ignores Infinity shift values', () => {
    const cache = new BoundsCache();
    const rect: DrawElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
    cache.get(rect);
    cache.updateAfterShift('r1', 5, Infinity);
    const bounds = cache.get(rect);
    expect(bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });
});
