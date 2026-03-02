import { describe, expect, it } from 'vitest';
import { createActiveBatch, easeOutCubic, strokeDurationMs, staggeredStartTimes, MAX_TOTAL_STAGGER_MS } from '@/lib/whiteboard/stroke-scheduler';

describe('stroke scheduler', () => {
  it('uses same startedAt timestamp for a batch', () => {
    const startedAt = 12345;
    const active = createActiveBatch(
      [
        {
          id: 's1',
          elementId: 'e1',
          color: '#000',
          baseWidth: 1,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        },
        {
          id: 's2',
          elementId: 'e2',
          color: '#000',
          baseWidth: 1,
          points: [
            { x: 0, y: 0 },
            { x: 0, y: 10 },
          ],
        },
      ],
      startedAt,
    );

    expect(active[0]?.startedAt).toBe(startedAt);
    expect(active[1]?.startedAt).toBe(startedAt);
  });

  it('clamps duration bounds', () => {
    expect(strokeDurationMs(1)).toBe(220);
    expect(strokeDurationMs(1_000_000)).toBe(2600);
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
