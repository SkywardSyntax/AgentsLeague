import { describe, it, expect } from 'vitest';
import {
  distance,
  cumulativeLengths,
  totalLength,
  partialPolylineByLength,
  resamplePolyline,
  screenStrokePx,
  MIN_SCREEN_STROKE_PX,
  MAX_SCREEN_STROKE_PX,
} from '@/lib/whiteboard/geometry';
import { rectPoints } from '@/lib/whiteboard/semantic-to-strokes';
import type { RectElement } from '@/types/agent';

describe('Geometry↔Canvas contract', () => {
  it('rectPoints produces exactly 5 points (closed polygon)', () => {
    const rect: RectElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
    const points = rectPoints(rect);
    expect(points).toHaveLength(5);
  });

  it('rectPoints first and last points are identical (polygon closure)', () => {
    const rect: RectElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
    const points = rectPoints(rect);
    expect(points[0]).toEqual(points[points.length - 1]);
  });

  it('resamplePolyline output points are all finite', () => {
    const input = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const resampled = resamplePolyline(input, 10);
    for (const p of resampled) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('resamplePolyline preserves first and last points', () => {
    const input = [{ x: 5, y: 10 }, { x: 50, y: 60 }, { x: 95, y: 110 }];
    const resampled = resamplePolyline(input, 8);
    expect(resampled[0]).toEqual(input[0]);
    expect(resampled[resampled.length - 1]).toEqual(input[input.length - 1]);
  });

  it('partialPolylineByLength at 0 returns single point', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const cumulative = cumulativeLengths(points);
    const partial = partialPolylineByLength(points, cumulative, 0);
    expect(partial).toHaveLength(1);
    expect(partial[0]).toEqual(points[0]);
  });

  it('partialPolylineByLength at full length returns all points', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const cumulative = cumulativeLengths(points);
    const total = totalLength(points);
    const partial = partialPolylineByLength(points, cumulative, total);
    expect(partial).toHaveLength(points.length);
  });

  it('screenStrokePx returns value within MIN/MAX bounds', () => {
    const testCases = [
      { baseWidth: 0.01, zoom: 0.25, dpr: 1 },
      { baseWidth: 2, zoom: 1, dpr: 2 },
      { baseWidth: 10, zoom: 4, dpr: 3 },
    ];
    for (const { baseWidth, zoom, dpr } of testCases) {
      const px = screenStrokePx(baseWidth, zoom, dpr);
      expect(px).toBeGreaterThanOrEqual(MIN_SCREEN_STROKE_PX);
      expect(px).toBeLessThanOrEqual(MAX_SCREEN_STROKE_PX);
    }
  });

  it('distance between identical points returns 0', () => {
    expect(distance({ x: 42, y: 99 }, { x: 42, y: 99 })).toBe(0);
  });

  it('cumulativeLengths first element is always 0', () => {
    const points = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 }];
    const cum = cumulativeLengths(points);
    expect(cum[0]).toBe(0);
  });

  it('totalLength of single point returns 0', () => {
    expect(totalLength([{ x: 5, y: 10 }])).toBe(0);
  });
});
