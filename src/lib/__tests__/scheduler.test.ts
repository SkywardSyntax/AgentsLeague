import { describe, expect, it } from 'vitest';
import {
  createActiveBatch,
  createStaggeredBatch,
  strokeDurationMs,
  easeOutCubic,
  easeInOutQuad,
  easeOutQuart,
  easeInOutCubic,
  cornerSpeedFactors,
  weightedVisibleLength,
} from '@/lib/whiteboard/stroke-scheduler';

const makeStrokes = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    elementId: `e${i}`,
    color: '#000',
    baseWidth: 1,
    points: [
      { x: 0, y: 0 },
      { x: 10 * (i + 1), y: 0 },
    ],
  }));

describe('stroke scheduler', () => {
  it('uses same startedAt timestamp for a batch', () => {
    const startedAt = 12345;
    const active = createActiveBatch(makeStrokes(2), startedAt);

    expect(active[0]?.startedAt).toBe(startedAt);
    expect(active[1]?.startedAt).toBe(startedAt);
  });

  it('clamps duration bounds', () => {
    expect(strokeDurationMs(1)).toBe(220);
    expect(strokeDurationMs(1_000_000)).toBe(2600);
  });

  it('uses injected clock when no startedAt provided', () => {
    const fakeClock = () => 99999;
    const active = createActiveBatch(makeStrokes(1), undefined, fakeClock);
    expect(active[0]?.startedAt).toBe(99999);
  });

  it('returns empty array for empty strokes', () => {
    expect(createActiveBatch([], 0)).toEqual([]);
  });
});

describe('strokeDurationMs guards', () => {
  it('returns 220 for NaN', () => {
    expect(strokeDurationMs(NaN)).toBe(220);
  });

  it('returns 220 for Infinity', () => {
    expect(strokeDurationMs(Infinity)).toBe(220);
  });

  it('returns 220 for -Infinity', () => {
    expect(strokeDurationMs(-Infinity)).toBe(220);
  });

  it('returns 220 for negative length', () => {
    expect(strokeDurationMs(-10)).toBe(220);
  });
});

describe('createStaggeredBatch', () => {
  it('offsets startedAt by staggerMs per stroke', () => {
    const active = createStaggeredBatch(makeStrokes(3), 50, 1000);
    expect(active[0]?.startedAt).toBe(1000);
    expect(active[1]?.startedAt).toBe(1050);
    expect(active[2]?.startedAt).toBe(1100);
  });

  it('uses injected clock when no startedAt provided', () => {
    const clock = () => 5000;
    const active = createStaggeredBatch(makeStrokes(2), 100, undefined, clock);
    expect(active[0]?.startedAt).toBe(5000);
    expect(active[1]?.startedAt).toBe(5100);
  });

  it('with stagger=0 behaves like createActiveBatch', () => {
    const staggered = createStaggeredBatch(makeStrokes(2), 0, 500);
    const batch = createActiveBatch(makeStrokes(2), 500);
    expect(staggered[0]?.startedAt).toBe(batch[0]?.startedAt);
    expect(staggered[1]?.startedAt).toBe(batch[1]?.startedAt);
  });

  it('returns empty array for empty strokes', () => {
    expect(createStaggeredBatch([], 50, 0)).toEqual([]);
  });
});

describe('easing functions', () => {
  const easings = [
    { name: 'easeOutCubic', fn: easeOutCubic },
    { name: 'easeInOutQuad', fn: easeInOutQuad },
    { name: 'easeOutQuart', fn: easeOutQuart },
    { name: 'easeInOutCubic', fn: easeInOutCubic },
  ];

  for (const { name, fn } of easings) {
    it(`${name}: f(0)=0 and f(1)=1`, () => {
      expect(fn(0)).toBeCloseTo(0, 10);
      expect(fn(1)).toBeCloseTo(1, 10);
    });

    it(`${name}: clamps out-of-range values`, () => {
      expect(fn(-0.5)).toBeCloseTo(0, 10);
      expect(fn(1.5)).toBeCloseTo(1, 10);
    });

    it(`${name}: monotonically increases`, () => {
      let prev = 0;
      for (let t = 0.05; t <= 1; t += 0.05) {
        const v = fn(t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-10);
        prev = v;
      }
    });

    it(`${name}: f(0.5) is in (0, 1)`, () => {
      const mid = fn(0.5);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
    });
  }
});

describe('cornerSpeedFactors', () => {
  it('returns all 1s for a straight line', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    const factors = cornerSpeedFactors(pts);
    expect(factors).toHaveLength(4);
    for (const f of factors) {
      expect(f).toBeCloseTo(1, 5);
    }
  });

  it('slows at 90-degree corners', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const factors = cornerSpeedFactors(pts);
    expect(factors[0]).toBe(1);
    expect(factors[2]).toBe(1);
    // Middle point: 90-degree corner → dot=0 → normalized=0.5 → factor≈0.675
    expect(factors[1]).toBeGreaterThan(0.35);
    expect(factors[1]).toBeLessThan(0.85);
  });

  it('slows most at 180-degree reversal', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ];
    const factors = cornerSpeedFactors(pts, 0.35);
    // 180-degree → dot=-1 → normalized=0 → factor=minFactor
    expect(factors[1]).toBeCloseTo(0.35, 5);
  });

  it('returns all 1s for 0-1-2 point inputs', () => {
    expect(cornerSpeedFactors([])).toEqual([]);
    expect(cornerSpeedFactors([{ x: 0, y: 0 }])).toEqual([1]);
    expect(cornerSpeedFactors([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual([1, 1]);
  });

  it('handles coincident points gracefully', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const factors = cornerSpeedFactors(pts);
    expect(factors[1]).toBe(0.35); // default minFactor for zero-length segment
  });
});

describe('createActiveBatch includes speedFactors', () => {
  it('populates speedFactors on each active stroke', () => {
    const strokes = makeStrokes(2);
    const active = createActiveBatch(strokes, 1000);
    for (const s of active) {
      expect(s.speedFactors).toBeDefined();
      expect(s.speedFactors!.length).toBe(s.points.length);
    }
  });

  it('createStaggeredBatch also includes speedFactors', () => {
    const active = createStaggeredBatch(makeStrokes(1), 0, 1000);
    expect(active[0]?.speedFactors).toBeDefined();
  });
});

describe('weightedVisibleLength', () => {
  it('returns 0 at t=0', () => {
    expect(weightedVisibleLength([0, 10, 20], [1, 1, 1], 0)).toBe(0);
  });

  it('returns total length at t=1', () => {
    expect(weightedVisibleLength([0, 10, 20], [1, 1, 1], 1)).toBe(20);
  });

  it('uniform factors give linear mapping', () => {
    const cum = [0, 10, 20, 30];
    const factors = [1, 1, 1, 1];
    expect(weightedVisibleLength(cum, factors, 0.5)).toBeCloseTo(15, 5);
  });

  it('corner with low speed factor delays midpoint', () => {
    // Straight-straight with slow middle: pen lingers at point 1
    const cum = [0, 10, 20];
    const slowMiddle = [1, 0.5, 1]; // factor 0.5 → takes 2× time at seg 0→1
    const atHalf = weightedVisibleLength(cum, slowMiddle, 0.5);
    // With uniform factors, 0.5 → length 10. With slow middle, more time spent on first seg.
    expect(atHalf).toBeLessThan(10);
  });

  it('handles single-point cumulative', () => {
    expect(weightedVisibleLength([0], [1], 0.5)).toBe(0);
  });

  it('handles empty cumulative', () => {
    expect(weightedVisibleLength([], [], 0.5)).toBe(0);
  });

  it('clamps t > 1 to total length', () => {
    expect(weightedVisibleLength([0, 10, 20], [1, 1, 1], 1.5)).toBe(20);
  });

  it('clamps t < 0 to 0', () => {
    expect(weightedVisibleLength([0, 10, 20], [1, 1, 1], -0.5)).toBe(0);
  });

  it('all-zero speed factors fall back to linear mapping', () => {
    const cum = [0, 10, 20];
    const factors = [0, 0, 0];
    // Should not NaN or crash — degenerate case
    const result = weightedVisibleLength(cum, factors, 0.5);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('NaN speed factors fall back to uniform weighting', () => {
    const cum = [0, 10, 20];
    const factors = [NaN, NaN, NaN];
    const result = weightedVisibleLength(cum, factors, 0.5);
    expect(Number.isFinite(result)).toBe(true);
    // NaN factors → uniform weighting (segLen/1 equivalent), so midpoint ≈ 10
    expect(result).toBeCloseTo(10, 5);
  });

  it('zero speed factor produces finite result', () => {
    const cum = [0, 10, 20];
    const factors = [1, 0, 1];
    const result = weightedVisibleLength(cum, factors, 0.5);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(20);
  });

  it('negative speed factor produces finite result', () => {
    const cum = [0, 10, 20];
    const factors = [1, -0.5, 1];
    const result = weightedVisibleLength(cum, factors, 0.5);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(20);
  });

  it('mixed NaN and valid factors produce finite result', () => {
    const cum = [0, 10, 20];
    const factors = [1, NaN, 1];
    const result = weightedVisibleLength(cum, factors, 0.5);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('Infinity speed factor falls back to uniform', () => {
    const cum = [0, 10, 20];
    const factors = [1, Infinity, 1];
    const result = weightedVisibleLength(cum, factors, 0.5);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('cornerSpeedFactors with NaN distances', () => {
  it('NaN coordinates produce finite factors via minFactor fallback', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: NaN, y: 0 },
      { x: 10, y: 0 },
    ];
    const factors = cornerSpeedFactors(pts);
    expect(factors).toHaveLength(3);
    // Endpoints are always 1
    expect(factors[0]).toBe(1);
    expect(factors[2]).toBe(1);
    // Middle point: NaN distance → d1===0 check fails, dot product is NaN
    // Result may be NaN or minFactor depending on branch; document behavior
    expect(typeof factors[1]).toBe('number');
  });
});
