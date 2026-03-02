import { describe, it, expect } from 'vitest';
import {
  clamp,
  distance,
  cumulativeLengths,
  totalLength,
  partialPolylineByLength,
  resamplePolyline,
  screenStrokePx,
} from '@/lib/whiteboard/geometry';
import {
  translatePoints,
  boundingBox,
  centroid,
} from '@/lib/whiteboard/geometry-pure';
import type { Point } from '@/types/agent';

describe('Lane 09 — Geometry API Surface', () => {
  it('clamp function contracts value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('distance returns a number', () => {
    const d = distance({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(d).toMatchInlineSnapshot(`5`);
    expect(typeof d).toBe('number');
  });

  it('cumulativeLengths returns number array starting with 0', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 }];
    const lengths = cumulativeLengths(points);
    expect(lengths[0]).toBe(0);
    expect(lengths).toHaveLength(points.length);
    expect(lengths).toMatchInlineSnapshot(`
      [
        0,
        5,
        10,
      ]
    `);
  });

  it('totalLength returns a single number', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 3, y: 4 }];
    const len = totalLength(points);
    expect(len).toMatchInlineSnapshot(`5`);
  });

  it('partialPolylineByLength returns a Point array', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const cumulative = [0, 10];
    const result = partialPolylineByLength(points, cumulative, 5);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchInlineSnapshot(`
      {
        "x": 5,
        "y": 0,
      }
    `);
  });

  it('resamplePolyline returns Point array', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const result = resamplePolyline(points, 5);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('screenStrokePx returns value within min/max range', () => {
    const px = screenStrokePx(2, 1, 1);
    expect(typeof px).toBe('number');
    expect(px).toBeGreaterThanOrEqual(1.25);
    expect(px).toBeLessThanOrEqual(5.5);
  });

  it('translatePoints returns new Point array without mutating input', () => {
    const points: Point[] = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    const result = translatePoints(points, 10, 20);
    expect(result).toMatchInlineSnapshot(`
      [
        {
          "x": 11,
          "y": 22,
        },
        {
          "x": 13,
          "y": 24,
        },
      ]
    `);
    expect(points[0].x).toBe(1);
  });

  it('boundingBox returns BoundingBox shape or null', () => {
    const box = boundingBox([{ x: 1, y: 2 }, { x: 5, y: 8 }]);
    expect(box).toMatchInlineSnapshot(`
      {
        "maxX": 5,
        "maxY": 8,
        "minX": 1,
        "minY": 2,
      }
    `);
    expect(boundingBox([])).toBeNull();
  });

  it('centroid returns Point or null', () => {
    const c = centroid([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(c).toMatchInlineSnapshot(`
      {
        "x": 5,
        "y": 5,
      }
    `);
    expect(centroid([])).toBeNull();
  });
});
