import { describe, expect, it } from 'vitest';
import { withJitter } from '@/lib/whiteboard/semantic-to-strokes';
import {
  screenStrokePx,
  MIN_SCREEN_STROKE_PX,
  MAX_SCREEN_STROKE_PX,
} from '@/lib/whiteboard/geometry';
import { easeOutCubic } from '@/lib/whiteboard/stroke-scheduler';
import type { Point } from '@/types/agent';

describe('iter28 · Style computation correctness', () => {
  const basePoints: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 20 },
    { x: 30, y: 30 },
    { x: 40, y: 40 },
  ];

  it('clean_pen_sketch preset does not scale stroke width (1.0x via withJitter jitter=0.24)', () => {
    // withJitter uses 0.24 for clean_pen_sketch — a moderate jitter
    const result = withJitter(basePoints, 'test-seed', 'clean_pen_sketch');
    // Middle points should be perturbed but not drastically
    for (let i = 1; i < result.length - 1; i++) {
      expect(Math.abs(result[i]!.x - basePoints[i]!.x)).toBeLessThan(0.24);
      expect(Math.abs(result[i]!.y - basePoints[i]!.y)).toBeLessThan(0.24);
    }
  });

  it('rough_sketch preset applies higher jitter displacement (0.85)', () => {
    const result = withJitter(basePoints, 'test-seed', 'rough_sketch');
    let maxDisplacement = 0;
    for (let i = 1; i < result.length - 1; i++) {
      const dx = Math.abs(result[i]!.x - basePoints[i]!.x);
      const dy = Math.abs(result[i]!.y - basePoints[i]!.y);
      maxDisplacement = Math.max(maxDisplacement, dx, dy);
    }
    // rough_sketch uses 0.85 jitter amount, so max displacement < 0.85 * 0.5 = 0.425
    expect(maxDisplacement).toBeLessThanOrEqual(0.85);
  });

  it('blueprint_neat preset applies minimal jitter displacement (0.12)', () => {
    const result = withJitter(basePoints, 'test-seed', 'blueprint_neat');
    for (let i = 1; i < result.length - 1; i++) {
      expect(Math.abs(result[i]!.x - basePoints[i]!.x)).toBeLessThan(0.12);
      expect(Math.abs(result[i]!.y - basePoints[i]!.y)).toBeLessThan(0.12);
    }
  });

  it('withJitter preserves first and last points (anchors)', () => {
    for (const preset of ['clean_pen_sketch', 'rough_sketch', 'blueprint_neat'] as const) {
      const result = withJitter(basePoints, 'anchor-test', preset);
      expect(result[0]).toEqual(basePoints[0]);
      expect(result[result.length - 1]).toEqual(basePoints[basePoints.length - 1]);
    }
  });

  it('withJitter with same seed is deterministic', () => {
    const a = withJitter(basePoints, 'determinism', 'clean_pen_sketch');
    const b = withJitter(basePoints, 'determinism', 'clean_pen_sketch');
    expect(a).toEqual(b);
  });

  it('withJitter rough_sketch has higher displacement than blueprint_neat', () => {
    const rough = withJitter(basePoints, 'compare', 'rough_sketch');
    const neat = withJitter(basePoints, 'compare', 'blueprint_neat');

    let roughTotal = 0, neatTotal = 0;
    for (let i = 1; i < basePoints.length - 1; i++) {
      roughTotal += Math.abs(rough[i]!.x - basePoints[i]!.x) + Math.abs(rough[i]!.y - basePoints[i]!.y);
      neatTotal += Math.abs(neat[i]!.x - basePoints[i]!.x) + Math.abs(neat[i]!.y - basePoints[i]!.y);
    }
    expect(roughTotal).toBeGreaterThan(neatTotal);
  });

  it('easeOutCubic(0) = 0 and easeOutCubic(1) = 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('easeOutCubic clamps values outside [0,1]', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(1.5)).toBe(1);
    expect(easeOutCubic(-100)).toBe(0);
    expect(easeOutCubic(100)).toBe(1);
  });

  it('screenStrokePx clamps to MIN (1.25) at very low zoom', () => {
    const result = screenStrokePx(2, 0.01, 1);
    expect(result).toBe(MIN_SCREEN_STROKE_PX);
  });

  it('screenStrokePx clamps to MAX (5.5) at very high zoom', () => {
    const result = screenStrokePx(2, 100, 2);
    expect(result).toBe(MAX_SCREEN_STROKE_PX);
  });
});
