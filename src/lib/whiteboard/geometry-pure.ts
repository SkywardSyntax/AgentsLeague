/**
 * Pure geometry operations — never mutate inputs, use only local variables.
 * Safe for concurrent use because there is no shared mutable state.
 */

import type { Point } from '@/types/agent';

export function translatePoints(points: ReadonlyArray<Point>, dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function scalePoints(points: ReadonlyArray<Point>, sx: number, sy: number, origin: Point = { x: 0, y: 0 }): Point[] {
  return points.map((p) => ({
    x: origin.x + (p.x - origin.x) * sx,
    y: origin.y + (p.y - origin.y) * sy,
  }));
}

export function rotatePoints(points: ReadonlyArray<Point>, angleRad: number, origin: Point = { x: 0, y: 0 }): Point[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return points.map((p) => {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    return {
      x: origin.x + dx * cos - dy * sin,
      y: origin.y + dx * sin + dy * cos,
    };
  });
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundingBox(points: ReadonlyArray<Point>): BoundingBox | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function centroid(points: ReadonlyArray<Point>): Point | null {
  if (points.length === 0) return null;
  let sx = 0, sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}
