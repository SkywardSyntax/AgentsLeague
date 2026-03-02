import { describe, expect, it, afterEach } from 'vitest';
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
  staggeredStartTimes,
  MAX_TOTAL_STAGGER_MS,
  prefersReducedMotion,
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

    expect(active[0]!.durationMs).toBe(strokeDurationMs(10));
    expect(active[0]!.length).toBe(10);
    expect(active[0]!.cumulativeLengths).toEqual([0, 10]);
    expect(active[1]!.durationMs).toBe(strokeDurationMs(20));
    expect(active[1]!.length).toBe(20);
    expect(active[1]!.cumulativeLengths).toEqual([0, 20]);
  });

  it('clamps duration bounds', () => {
    expect(strokeDurationMs(1)).toBe(220);
    expect(strokeDurationMs(1_000_000)).toBe(2600);
  });

  it('returns empty array for empty strokes input', () => {
    expect(createActiveBatch([])).toEqual([]);
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

describe('easeOutCubic', () => {
  it('returns 0 at start boundary', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns 1 at end boundary', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('returns 0.875 at midpoint', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });

  it('clamps out-of-range values', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(1.5)).toBe(1);
  });
});

describe('strokeDurationMs boundaries', () => {
  it('clamps zero length to 220ms minimum', () => {
    expect(strokeDurationMs(0)).toBe(220);
  });

  it('returns 220 for Infinity', () => {
    expect(strokeDurationMs(Infinity)).toBe(220);
  });

  it('clamps negative length to 220ms minimum', () => {
    expect(strokeDurationMs(-100)).toBe(220);
  });

  it('returns 220 for NaN', () => {
    expect(strokeDurationMs(NaN)).toBe(220);
  });

  it('returns 220 for -Infinity', () => {
    expect(strokeDurationMs(-Infinity)).toBe(220);
  });
});

describe('easeOutCubic additional', () => {
  it('returns exactly 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns exactly 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('returns 0.875 at t=0.5', () => {
    expect(easeOutCubic(0.5)).toBe(0.875);
  });

  it('clamps negative input to 0, returning 0', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
  });

  it('clamps input above 1 to 1, returning 1', () => {
    expect(easeOutCubic(2)).toBe(1);
  });

  it('is monotonically non-decreasing', () => {
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const val = easeOutCubic(t);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it('is concave (decelerating) — midpoint value exceeds linear interpolation', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
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
    expect(factors[1]).toBe(0.35);
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
    const cum = [0, 10, 20];
    const slowMiddle = [1, 0.5, 1];
    const atHalf = weightedVisibleLength(cum, slowMiddle, 0.5);
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
    const result = weightedVisibleLength(cum, factors, 0.5);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('NaN speed factors fall back to uniform weighting', () => {
    const cum = [0, 10, 20];
    const factors = [NaN, NaN, NaN];
    const result = weightedVisibleLength(cum, factors, 0.5);
    expect(Number.isFinite(result)).toBe(true);
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
    expect(factors[0]).toBe(1);
    expect(factors[2]).toBe(1);
    expect(typeof factors[1]).toBe('number');
  });
});

const makeStroke = (id: string) => ({
  id,
  elementId: `e-${id}`,
  color: '#000',
  baseWidth: 1,
  points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
});

describe('staggeredStartTimes', () => {
  it('returns monotonically increasing values with correct spacing', () => {
    const times = staggeredStartTimes(4, 1000, 60);
    expect(times).toEqual([1000, 1060, 1120, 1180]);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    }
  });

  it('clamps total stagger so large batch does not exceed MAX_TOTAL_STAGGER_MS', () => {
    const count = 100;
    const times = staggeredStartTimes(count, 0, 60);
    const spread = times[times.length - 1]! - times[0]!;
    expect(spread).toBeLessThanOrEqual(MAX_TOTAL_STAGGER_MS);
  });

  it('returns empty array for count = 0', () => {
    expect(staggeredStartTimes(0, 1000)).toEqual([]);
  });

  it('returns single element for count = 1', () => {
    expect(staggeredStartTimes(1, 5000)).toEqual([5000]);
  });

  it('handles NaN staggerMs by using default', () => {
    const times = staggeredStartTimes(3, 1000, NaN);
    expect(times.length).toBe(3);
    expect(times[1]! - times[0]!).toBe(60);
  });

  it('handles Infinity staggerMs by using default', () => {
    const times = staggeredStartTimes(3, 1000, Infinity);
    expect(times.length).toBe(3);
    expect(times[1]! - times[0]!).toBe(60);
  });
});

describe('easeOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('returns 0.875 at t=0.5 per formula 1-(1-t)^3', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
  });

  it('clamps negative input to 0', () => {
    expect(easeOutCubic(-0.1)).toBe(0);
    expect(easeOutCubic(-100)).toBe(0);
  });

  it('clamps input above 1 to 1', () => {
    expect(easeOutCubic(1.5)).toBe(1);
    expect(easeOutCubic(999)).toBe(1);
  });

  it('is monotonically increasing for t in [0, 1]', () => {
    let prev = easeOutCubic(0);
    for (let t = 0.01; t <= 1; t += 0.01) {
      const cur = easeOutCubic(t);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe('createActiveBatch with stagger', () => {
  it('assigns different startedAt per stroke when stagger is true', () => {
    const strokes = [makeStroke('s1'), makeStroke('s2'), makeStroke('s3')];
    const active = createActiveBatch(strokes, 1000, true);
    const times = active.map(s => s.startedAt);
    const unique = new Set(times);
    expect(unique.size).toBe(3);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    }
  });

  it('assigns identical startedAt when stagger is false (default)', () => {
    const strokes = [makeStroke('s1'), makeStroke('s2')];
    const active = createActiveBatch(strokes, 1000);
    expect(active[0]?.startedAt).toBe(1000);
    expect(active[1]?.startedAt).toBe(1000);
  });

  it('silently drops strokes with fewer than 2 points', () => {
    const strokes = [
      makeStroke('valid'),
      { id: 'empty', elementId: 'e-empty', color: '#000', baseWidth: 1, points: [] },
      { id: 'single', elementId: 'e-single', color: '#000', baseWidth: 1, points: [{ x: 5, y: 5 }] },
    ];
    const active = createActiveBatch(strokes, 1000);
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe('valid');
  });

  it('returns empty array for all-degenerate input', () => {
    const strokes = [
      { id: 'empty', elementId: 'e-empty', color: '#000', baseWidth: 1, points: [] },
      { id: 'single', elementId: 'e-single', color: '#000', baseWidth: 1, points: [{ x: 0, y: 0 }] },
    ];
    const active = createActiveBatch(strokes, 1000);
    expect(active).toEqual([]);
  });

  it('returns empty array for empty strokes input with stagger', () => {
    const active = createActiveBatch([], 1000, true);
    expect(active).toEqual([]);
  });
});

describe('prefersReducedMotion', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { value: originalMatchMedia, writable: true, configurable: true });
  });

  it('returns false when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', { value: undefined, writable: true, configurable: true });
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns true when prefers-reduced-motion matches', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: true }),
      writable: true,
      configurable: true,
    });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when prefers-reduced-motion does not match', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false }),
      writable: true,
      configurable: true,
    });
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('strokeDurationMs with reducedMotion', () => {
  it('returns 0 when reducedMotion is true', () => {
    expect(strokeDurationMs(500, true)).toBe(0);
    expect(strokeDurationMs(0, true)).toBe(0);
    expect(strokeDurationMs(1_000_000, true)).toBe(0);
  });

  it('returns normal duration when reducedMotion is false', () => {
    expect(strokeDurationMs(500, false)).toBeGreaterThan(0);
  });
});

describe('createActiveBatch with reducedMotion', () => {
  it('sets durationMs to 0 for all strokes when reducedMotion is true', () => {
    const strokes = [makeStroke('s1'), makeStroke('s2')];
    const active = createActiveBatch(strokes, 1000, false, true);
    for (const s of active) {
      expect(s.durationMs).toBe(0);
    }
  });

  it('disables stagger when reducedMotion is true', () => {
    const strokes = [makeStroke('s1'), makeStroke('s2'), makeStroke('s3')];
    const active = createActiveBatch(strokes, 1000, true, true);
    const times = active.map(s => s.startedAt);
    expect(new Set(times).size).toBe(1);
  });
});
