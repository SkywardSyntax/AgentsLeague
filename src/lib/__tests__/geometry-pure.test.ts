import { describe, it, expect } from 'vitest';
import {
  translatePoints,
  scalePoints,
  rotatePoints,
  boundingBox,
  centroid,
} from '@/lib/whiteboard/geometry-pure';
import type { Point } from '@/types/agent';

const triangle: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: 10 },
];

describe('concurrent geometry ops (pure)', () => {
  it('translatePoints returns new array, original unchanged', () => {
    const original = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    const copy = original.map((p) => ({ ...p }));
    const result = translatePoints(original, 10, 20);
    expect(original).toEqual(copy);
    expect(result[0]).toEqual({ x: 11, y: 22 });
    expect(result[1]).toEqual({ x: 13, y: 24 });
  });

  it('scalePoints returns new array, original unchanged', () => {
    const original = [{ x: 2, y: 4 }];
    const copy = [{ x: 2, y: 4 }];
    const result = scalePoints(original, 3, 2);
    expect(original).toEqual(copy);
    expect(result[0]).toEqual({ x: 6, y: 8 });
  });

  it('rotatePoints returns new array, original unchanged', () => {
    const original = [{ x: 1, y: 0 }];
    const copy = [{ x: 1, y: 0 }];
    const result = rotatePoints(original, Math.PI / 2);
    expect(original).toEqual(copy);
    expect(result[0]!.x).toBeCloseTo(0, 10);
    expect(result[0]!.y).toBeCloseTo(1, 10);
  });

  it('boundingBox does not mutate input', () => {
    const original = triangle.map((p) => ({ ...p }));
    const bb = boundingBox(triangle);
    expect(triangle).toEqual(original);
    expect(bb).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('centroid does not mutate input', () => {
    const original = triangle.map((p) => ({ ...p }));
    const c = centroid(triangle);
    expect(triangle).toEqual(original);
    expect(c!.x).toBeCloseTo(5, 10);
    expect(c!.y).toBeCloseTo(10 / 3, 10);
  });

  it('concurrent translatePoints calls do not interfere', () => {
    const pts = [{ x: 1, y: 1 }];
    const r1 = translatePoints(pts, 10, 0);
    const r2 = translatePoints(pts, 0, 10);
    expect(r1[0]).toEqual({ x: 11, y: 1 });
    expect(r2[0]).toEqual({ x: 1, y: 11 });
    expect(pts[0]).toEqual({ x: 1, y: 1 });
  });

  it('concurrent scalePoints calls do not interfere', () => {
    const pts = [{ x: 2, y: 3 }];
    const r1 = scalePoints(pts, 2, 2);
    const r2 = scalePoints(pts, 0.5, 0.5);
    expect(r1[0]).toEqual({ x: 4, y: 6 });
    expect(r2[0]).toEqual({ x: 1, y: 1.5 });
    expect(pts[0]).toEqual({ x: 2, y: 3 });
  });

  it('empty input returns empty output', () => {
    expect(translatePoints([], 1, 1)).toEqual([]);
    expect(scalePoints([], 2, 2)).toEqual([]);
    expect(rotatePoints([], 1)).toEqual([]);
    expect(boundingBox([])).toBeNull();
    expect(centroid([])).toBeNull();
  });

  it('single-point input works correctly', () => {
    const pt: Point[] = [{ x: 5, y: 5 }];
    expect(translatePoints(pt, 1, -1)).toEqual([{ x: 6, y: 4 }]);
    expect(boundingBox(pt)).toEqual({ minX: 5, minY: 5, maxX: 5, maxY: 5 });
    expect(centroid(pt)).toEqual({ x: 5, y: 5 });
  });

  it('large array (10k points) produces correct results without mutation', () => {
    const pts: Point[] = Array.from({ length: 10_000 }, (_, i) => ({
      x: i,
      y: i * 2,
    }));
    const originalFirst = { ...pts[0]! };
    const originalLast = { ...pts[9999]! };

    const translated = translatePoints(pts, 100, 200);
    expect(pts[0]).toEqual(originalFirst);
    expect(pts[9999]).toEqual(originalLast);
    expect(translated).toHaveLength(10_000);
    expect(translated[0]).toEqual({ x: 100, y: 200 });
    expect(translated[9999]).toEqual({ x: 10099, y: 20198 });
  });
});
