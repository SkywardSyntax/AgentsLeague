import { describe, expect, it } from 'vitest';
import {
  createActiveBatch,
  easeOutCubic,
  strokeDurationMs,
} from '@/lib/whiteboard/stroke-scheduler';

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

describe('strokeDurationMs boundaries', () => {
  it('clamps zero length to 220ms minimum', () => {
    expect(strokeDurationMs(0)).toBe(220);
  });

  it('clamps Infinity to 2600ms maximum', () => {
    expect(strokeDurationMs(Infinity)).toBe(2600);
  });

  it('clamps negative length to 220ms minimum', () => {
    expect(strokeDurationMs(-100)).toBe(220);
  });

  it('returns NaN for NaN input (Math.max/min with NaN)', () => {
    expect(strokeDurationMs(NaN)).toBeNaN();
  });
});

describe('easeOutCubic', () => {
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
});
