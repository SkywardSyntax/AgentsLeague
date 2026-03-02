import { describe, expect, it } from 'vitest';
import { createActiveBatch, easeOutCubic, strokeDurationMs } from '@/lib/whiteboard/stroke-scheduler';

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

  it('returns empty array for empty strokes input', () => {
    expect(createActiveBatch([])).toEqual([]);
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
