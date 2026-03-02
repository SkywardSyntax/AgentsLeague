import { describe, expect, it } from 'vitest';
import {
  cumulativeLengths,
  distance,
  partialPolylineByLength,
  resamplePolyline,
  screenStrokePx,
  MIN_SCREEN_STROKE_PX,
  MAX_SCREEN_STROKE_PX,
} from '@/lib/whiteboard/geometry';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { extractSvgStrokes } from '@/lib/latex/mathjax-client';
import type { Point } from '@/types/agent';

function hasNoNaN(points: Point[]): boolean {
  return points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

describe('numerical stability', () => {
  it('resamplePolyline handles zero-length segment (coincident points)', () => {
    const pts: Point[] = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ];
    const result = resamplePolyline(pts, 2);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('resamplePolyline handles all coincident points', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const result = resamplePolyline(pts, 2);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(hasNoNaN(result)).toBe(true);
  });

  it('partialPolylineByLength with targetLength=0 returns first point only', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const cum = cumulativeLengths(pts);
    const result = partialPolylineByLength(pts, cum, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(pts[0]);
  });

  it('cumulativeLengths with empty array returns empty', () => {
    expect(cumulativeLengths([])).toHaveLength(0);
  });

  it('cumulativeLengths never produces NaN/Infinity', () => {
    for (let trial = 0; trial < 100; trial++) {
      const count = Math.floor(Math.random() * 10) + 2;
      const pts: Point[] = [];
      for (let i = 0; i < count; i++) {
        // Include coincident points occasionally
        if (i > 0 && Math.random() < 0.3) {
          pts.push({ ...pts[i - 1]! });
        } else {
          pts.push({
            x: (Math.random() - 0.5) * 1000,
            y: (Math.random() - 0.5) * 1000,
          });
        }
      }
      const cum = cumulativeLengths(pts);
      for (const v of cum) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('ellipsePoints with zero radii does not produce NaN', async () => {
    const { strokes } = await compileBatchToStrokes({
      batch_id: 'test-zero-ellipse',
      elements: [
        { type: 'ellipse', id: 'e0', cx: 0, cy: 0, rx: 0, ry: 0 },
      ],
    });
    expect(strokes.length).toBeGreaterThanOrEqual(1);
    for (const stroke of strokes) {
      expect(hasNoNaN(stroke.points)).toBe(true);
    }
  });

  it('ellipsePoints with negative radii does not produce NaN', async () => {
    const { strokes } = await compileBatchToStrokes({
      batch_id: 'test-neg-ellipse',
      elements: [
        { type: 'ellipse', id: 'e1', cx: 0, cy: 0, rx: -10, ry: -5 },
      ],
    });
    expect(strokes.length).toBeGreaterThanOrEqual(1);
    for (const stroke of strokes) {
      expect(hasNoNaN(stroke.points)).toBe(true);
    }
  });

  it('screenStrokePx clamps extreme values', () => {
    expect(screenStrokePx(0, 0, 0)).toBe(MIN_SCREEN_STROKE_PX);
    expect(screenStrokePx(1000, 100, 10)).toBe(MAX_SCREEN_STROKE_PX);
    const nanResult = screenStrokePx(NaN, 1, 1);
    expect(Number.isFinite(nanResult)).toBe(true);
  });

  it('distance handles very large coordinates without Infinity', () => {
    const result = distance(
      { x: 1e150, y: 1e150 },
      { x: -1e150, y: -1e150 },
    );
    expect(Number.isFinite(result)).toBe(true);
  });

  it('getSvgViewportMatrix handles zero-dimension viewBox', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"><line x1="0" y1="0" x2="10" y2="10"/></svg>';
    const strokes = extractSvgStrokes(svg, {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      strokeIdPrefix: 'test',
      color: '#000',
      baseWidth: 1,
    });
    // With zero viewBox, the viewport matrix should be identity (no division by zero)
    for (const stroke of strokes) {
      expect(hasNoNaN(stroke.points)).toBe(true);
    }
  });
});
