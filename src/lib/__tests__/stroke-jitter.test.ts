import { describe, expect, it } from 'vitest';
import { withJitter, withJitterAmount } from '@/lib/whiteboard/stroke-jitter';

describe('stroke-jitter', () => {
  const threePoints = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 20 },
  ];

  it('preserves first and last points exactly', () => {
    const result = withJitter(threePoints, 'seed', 'clean_pen_sketch');
    expect(result[0]).toEqual(threePoints[0]);
    expect(result[result.length - 1]).toEqual(threePoints[threePoints.length - 1]);
  });

  it('produces identical output for same seed and points (determinism)', () => {
    const a = withJitter(threePoints, 'abc', 'rough_sketch');
    const b = withJitter(threePoints, 'abc', 'rough_sketch');
    expect(a).toEqual(b);
  });

  it('rough_sketch produces larger offsets than blueprint_neat', () => {
    const rough = withJitter(threePoints, 'cmp', 'rough_sketch');
    const neat = withJitter(threePoints, 'cmp', 'blueprint_neat');
    const roughDelta = Math.abs(rough[1]!.x - threePoints[1]!.x);
    const neatDelta = Math.abs(neat[1]!.x - threePoints[1]!.x);
    // rough_sketch amount=0.85 vs blueprint_neat amount=0.12
    // With same seed the random factor is identical, so offset scales linearly with amount
    expect(roughDelta).toBeGreaterThan(neatDelta);
  });

  it('returns empty array for empty input', () => {
    expect(withJitter([], 'seed', 'clean_pen_sketch')).toEqual([]);
  });

  it('returns single point unchanged', () => {
    const single = [{ x: 5, y: 5 }];
    expect(withJitter(single, 'seed', 'rough_sketch')).toEqual(single);
  });

  it('withJitterAmount with amount=0 returns original points', () => {
    const result = withJitterAmount(threePoints, 'seed', 0);
    expect(result).toBe(threePoints);
  });
});
