import { describe, expect, it } from 'vitest';
import {
  createActiveBatch,
  easeOutCubic,
  STROKE_SPEED_PX_PER_SECOND,
  strokeDurationMs,
} from '@/lib/whiteboard/stroke-scheduler';

describe('strokeDurationMs mid-range', () => {
  it('returns (length / speed) * 1000 for mid-range lengths', () => {
    const length = 90;
    const expected = (length / STROKE_SPEED_PX_PER_SECOND) * 1000;
    expect(strokeDurationMs(length)).toBe(expected);
    expect(expected).toBeGreaterThan(220);
    expect(expected).toBeLessThan(2600);
  });
});

describe('easeOutCubic', () => {
  it('returns 0 for t=0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns 1 for t=1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('clamps out-of-range inputs', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(1.5)).toBe(1);
  });
});

describe('createActiveBatch empty input', () => {
  it('returns an empty array for empty strokes', () => {
    expect(createActiveBatch([])).toEqual([]);
  });
});
