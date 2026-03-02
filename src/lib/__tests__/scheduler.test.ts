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

    expect(active[0]!.durationMs).toBe(strokeDurationMs(10));
    expect(active[0]!.length).toBe(10);
    expect(active[0]!.cumulativeLengths).toEqual([0, 10]);
    expect(active[1]!.durationMs).toBe(strokeDurationMs(10));
    expect(active[1]!.length).toBe(10);
    expect(active[1]!.cumulativeLengths).toEqual([0, 10]);
  });

  it('clamps duration bounds', () => {
    expect(strokeDurationMs(1)).toBe(220);
    expect(strokeDurationMs(1_000_000)).toBe(2600);
  });

  it('createActiveBatch returns empty array for empty input', () => {
    expect(createActiveBatch([])).toEqual([]);
  });
});

describe('easeOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('returns 0.875 at t=0.5', () => {
    expect(easeOutCubic(0.5)).toBe(0.875);
  });

  it('clamps below-range and above-range values', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});
