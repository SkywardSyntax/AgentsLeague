import { describe, expect, it } from 'vitest';
import { arrowHeadPoints } from '@/lib/whiteboard/semantic-to-strokes';
import type { ArrowElement } from '@/types/agent';
import { distance } from '@/lib/whiteboard/geometry';

function mkArrow(from: { x: number; y: number }, to: { x: number; y: number }, strokeWidth?: number): ArrowElement {
  return { type: 'arrow', id: 'a1', from, to, stroke_width: strokeWidth };
}

describe('arrowHeadPoints geometry', () => {
  it('horizontal arrow (left→right): head points form symmetric V opening leftward', () => {
    const heads = arrowHeadPoints(mkArrow({ x: 0, y: 0 }, { x: 100, y: 0 }));
    expect(heads).toHaveLength(2);

    const [leftBarb, rightBarb] = heads;
    // Both barbs end at the tip
    expect(leftBarb![1]).toEqual({ x: 100, y: 0 });
    expect(rightBarb![1]).toEqual({ x: 100, y: 0 });
    // Barb starts are behind the tip (x < 100)
    expect(leftBarb![0]!.x).toBeLessThan(100);
    expect(rightBarb![0]!.x).toBeLessThan(100);
    // Symmetric about the shaft axis (y values mirror)
    expect(leftBarb![0]!.y).toBeCloseTo(-rightBarb![0]!.y, 10);
  });

  it('vertical arrow (bottom→top): head points form symmetric V opening downward', () => {
    const heads = arrowHeadPoints(mkArrow({ x: 0, y: 100 }, { x: 0, y: 0 }));
    const [left, right] = heads;
    // Both barbs end at tip
    expect(left![1]).toEqual({ x: 0, y: 0 });
    expect(right![1]).toEqual({ x: 0, y: 0 });
    // Barb starts are below tip
    expect(left![0]!.y).toBeGreaterThan(0);
    expect(right![0]!.y).toBeGreaterThan(0);
    // Symmetric about vertical axis
    expect(left![0]!.x).toBeCloseTo(-right![0]!.x, 10);
  });

  it('diagonal arrow: head points are equidistant from the tip', () => {
    const heads = arrowHeadPoints(mkArrow({ x: 0, y: 0 }, { x: 100, y: 100 }));
    const [left, right] = heads;
    const tip = { x: 100, y: 100 };
    const dLeft = distance(left![0]!, tip);
    const dRight = distance(right![0]!, tip);
    expect(dLeft).toBeCloseTo(dRight, 10);
  });

  it('very short arrow: head length is clamped to minimum', () => {
    const heads = arrowHeadPoints(mkArrow({ x: 0, y: 0 }, { x: 5, y: 0 }));
    const [left, right] = heads;
    const headLen = distance(left![0]!, left![1]!);
    // Head length is clamped to minimum of 8, even for short shafts
    expect(headLen).toBeGreaterThanOrEqual(8);
    expect(headLen).toBeLessThanOrEqual(28);
    expect(distance(right![0]!, right![1]!)).toBeCloseTo(headLen, 10);
  });

  it('arrow head symmetry: barb points are mirror-symmetric about shaft axis', () => {
    const heads = arrowHeadPoints(mkArrow({ x: 20, y: 30 }, { x: 120, y: 80 }));
    const [left, right] = heads;
    const tip = { x: 120, y: 80 };

    // Distances from tip to each barb should be equal
    expect(distance(left![0]!, tip)).toBeCloseTo(distance(right![0]!, tip), 10);

    // Midpoint of the two barb bases should lie on the shaft line
    const midX = (left![0]!.x + right![0]!.x) / 2;
    const midY = (left![0]!.y + right![0]!.y) / 2;
    const dx = 120 - 20;
    const dy = 80 - 30;
    // Vector from tip to midpoint should be anti-parallel to shaft direction
    const toMidX = midX - 120;
    const toMidY = midY - 80;
    // Cross product should be ~0 (collinear)
    const cross = dx * toMidY - dy * toMidX;
    expect(cross).toBeCloseTo(0, 5);
  });

  it('zero-length arrow (from === to): no NaN in output', () => {
    const heads = arrowHeadPoints(mkArrow({ x: 50, y: 50 }, { x: 50, y: 50 }));
    expect(heads).toHaveLength(2);
    for (const barb of heads) {
      for (const pt of barb) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });
});
