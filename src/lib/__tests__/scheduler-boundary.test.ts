import { describe, expect, it } from 'vitest';
import {
  createActiveBatch,
  easeOutCubic,
  STROKE_SPEED_PX_PER_SECOND,
  strokeDurationMs,
} from '@/lib/whiteboard/stroke-scheduler';

describe('strokeDurationMs boundary values', () => {
  // raw = (length / 180) * 1000; clamp [220, 2600]
  // Lower boundary: 220 * 180 / 1000 = 39.6
  // Upper boundary: 2600 * 180 / 1000 = 468

  it('returns exactly 220 at lower clamp boundary (39.6px)', () => {
    const boundary = (220 * STROKE_SPEED_PX_PER_SECOND) / 1000; // 39.6
    expect(strokeDurationMs(boundary)).toBe(220);
    expect(strokeDurationMs(boundary + 0.1)).toBeGreaterThan(220);
  });

  it('returns exactly 2600 at upper clamp boundary (468px)', () => {
    const boundary = (2600 * STROKE_SPEED_PX_PER_SECOND) / 1000; // 468
    expect(strokeDurationMs(boundary)).toBe(2600);
    expect(strokeDurationMs(boundary - 0.1)).toBeLessThan(2600);
  });

  it('clamps zero-length stroke to 220', () => {
    expect(strokeDurationMs(0)).toBe(220);
  });
});

describe('createActiveBatch edge cases', () => {
  it('returns empty array for empty strokes', () => {
    const result = createActiveBatch([], 1000);
    expect(result).toEqual([]);
  });

  it('handles single-point stroke (filtered out, needs >= 2 points)', () => {
    const result = createActiveBatch(
      [{ id: 's1', elementId: 'e1', color: '#000', baseWidth: 1, points: [{ x: 5, y: 5 }] }],
      1000,
    );
    expect(result).toEqual([]);
  });
});

describe('easeOutCubic boundary values', () => {
  it('returns correct values at exact boundaries and clamped inputs', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-0.5)).toBe(0); // clamped to 0
    expect(easeOutCubic(1.5)).toBe(1); // clamped to 1
    // t=0.5: 1 - (1 - 0.5)^3 = 1 - 0.125 = 0.875
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
  });
});
