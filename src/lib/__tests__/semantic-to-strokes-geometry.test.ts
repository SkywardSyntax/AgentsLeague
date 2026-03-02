import { describe, it, expect } from 'vitest';
import { rectPoints, withJitter } from '../whiteboard/semantic-to-strokes';
import type { Point } from '@/types/agent';

describe('rectPoints — geometry', () => {
  const makeRect = (x: number, y: number, w: number, h: number) =>
    ({ type: 'rect' as const, id: 'r', x, y, w, h });

  it('returns 5 points (closed rectangle)', () => {
    expect(rectPoints(makeRect(0, 0, 100, 50))).toHaveLength(5);
  });

  it('first and last points are identical (closed path)', () => {
    const pts = rectPoints(makeRect(0, 0, 100, 50));
    expect(pts[0]).toEqual(pts[4]);
  });

  it('clockwise winding order', () => {
    const pts = rectPoints(makeRect(0, 0, 100, 50));
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
      { x: 0, y: 0 },
    ]);
  });

  it('negative width/height — faithfully computes without clamping', () => {
    const pts = rectPoints(makeRect(100, 50, -100, -50));
    expect(pts).toEqual([
      { x: 100, y: 50 },
      { x: 0, y: 50 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  it('zero dimensions — 5 identical points (degenerate)', () => {
    const pts = rectPoints(makeRect(10, 20, 0, 0));
    expect(pts).toHaveLength(5);
    for (const p of pts) {
      expect(p).toEqual({ x: 10, y: 20 });
    }
  });
});

describe('withJitter — endpoint preservation', () => {
  function makePoints(n: number): Point[] {
    return Array.from({ length: n }, (_, i) => ({ x: i * 10, y: i * 5 }));
  }

  it('never modifies first point', () => {
    for (let i = 0; i < 50; i++) {
      const pts = makePoints(10);
      const result = withJitter(pts, `seed-${i}`, 'rough_sketch');
      expect(result[0]).toEqual(pts[0]);
    }
  });

  it('never modifies last point', () => {
    for (let i = 0; i < 50; i++) {
      const pts = makePoints(10);
      const result = withJitter(pts, `seed-${i}`, 'rough_sketch');
      expect(result[result.length - 1]).toEqual(pts[pts.length - 1]);
    }
  });

  it('single point returns unchanged', () => {
    const pts: Point[] = [{ x: 5, y: 5 }];
    expect(withJitter(pts, 'seed', 'rough_sketch')).toEqual([{ x: 5, y: 5 }]);
  });

  it('two points returns both unchanged (both are endpoints)', () => {
    const pts: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(withJitter(pts, 'seed', 'rough_sketch')).toEqual(pts);
  });

  it('interior points ARE modified for rough_sketch', () => {
    const pts = makePoints(5);
    const result = withJitter(pts, 'test-seed', 'rough_sketch');
    // Interior indices 1, 2, 3 should be jittered
    const anyMoved = [1, 2, 3].some(
      (i) => result[i].x !== pts[i].x || result[i].y !== pts[i].y,
    );
    expect(anyMoved).toBe(true);
  });

  it('determinism — same seed + preset = same output', () => {
    const pts = makePoints(8);
    const r1 = withJitter(pts, 'det-seed', 'rough_sketch');
    const r2 = withJitter(pts, 'det-seed', 'rough_sketch');
    expect(r1).toEqual(r2);
  });
});
