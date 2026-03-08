import { describe, expect, it } from 'vitest';
import {
  createActiveBatch,
  easeOutCubic,
  strokeDurationMs,
} from '@/lib/whiteboard/stroke-scheduler';

describe('scheduler invariants', () => {
  it('zero-length stroke (two identical points) gets min clamp', () => {
    const [active] = createActiveBatch(
      [
        {
          id: 's',
          elementId: 'e',
          points: [
            { x: 5, y: 5 },
            { x: 5, y: 5 },
          ],
          color: '#000',
          baseWidth: 1,
        },
      ],
      0,
    );
    expect(active!.durationMs).toBe(60);
    expect(active!.length).toBe(0);
  });

  it('single-point stroke gets filtered out (needs >= 2 points)', () => {
    const batch = createActiveBatch(
      [{ id: 's', elementId: 'e', points: [{ x: 0, y: 0 }], color: '#000', baseWidth: 1 }],
      0,
    );
    expect(batch).toEqual([]);
  });

  it('empty points array gets filtered out (needs >= 2 points)', () => {
    const batch = createActiveBatch(
      [{ id: 's', elementId: 'e', points: [], color: '#000', baseWidth: 1 }],
      0,
    );
    expect(batch).toEqual([]);
  });

  it('very long stroke (10000px) gets max clamp', () => {
    const [active] = createActiveBatch(
      [
        {
          id: 's',
          elementId: 'e',
          points: [
            { x: 0, y: 0 },
            { x: 10000, y: 0 },
          ],
          color: '#000',
          baseWidth: 1,
        },
      ],
      0,
    );
    expect(active!.durationMs).toBe(2600);
  });

  it('easeOutCubic returns 0 for t=0 and 1 for t=1, clamps out-of-range', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it('easeOutCubic is monotonically non-decreasing', () => {
    let prev = easeOutCubic(0);
    for (let i = 1; i <= 100; i++) {
      const t = i / 100;
      const val = easeOutCubic(t);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });
});
