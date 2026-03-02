import type { Point } from '@/types/agent';

/** Minimum screen-space stroke width in pixels, used to keep strokes visible at low zoom. */
export const MIN_SCREEN_STROKE_PX = 1.25;
/** Maximum screen-space stroke width in pixels, used to cap strokes at high zoom. */
export const MAX_SCREEN_STROKE_PX = 5.5;

/** Clamp `value` to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Euclidean distance between two 2D points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Compute cumulative arc-lengths along a polyline. Returns an array of the same length as `points`, starting at 0. */
export function cumulativeLengths(points: Point[]): number[] {
  if (points.length === 0) return [];
  const out: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    out.push((out[i - 1] ?? 0) + distance(points[i - 1]!, points[i]!));
  }
  return out;
}

/** Total arc-length of a polyline (sum of all segment lengths). Returns 0 for empty arrays. */
export function totalLength(points: Point[]): number {
  const lengths = cumulativeLengths(points);
  return lengths[lengths.length - 1] ?? 0;
}

/**
 * Walk `points` up to `targetLength` along the polyline defined by
 * `cumulative` distances, returning the partial path including an
 * interpolated endpoint. Used for progressive stroke reveal animation.
 */
export function partialPolylineByLength(
  points: Point[],
  cumulative: number[],
  targetLength: number,
): Point[] {
  if (points.length <= 1) return points;
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (targetLength <= 0) return [points[0]!];
  if (targetLength >= total) return points;

  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const segStart = cumulative[i - 1] ?? 0;
    const segEnd = cumulative[i] ?? 0;
    const a = points[i - 1]!;
    const b = points[i]!;

    if (segEnd <= targetLength) {
      out.push(b);
      continue;
    }

    const segLen = segEnd - segStart;
    const t = segLen > 0 ? (targetLength - segStart) / segLen : 0;
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
    break;
  }

  return out;
}

/**
 * Resample a polyline so consecutive points are approximately `spacing`
 * world-units apart. The first and last points are always preserved.
 */
export function resamplePolyline(points: Point[], spacing: number): Point[] {
  if (points.length <= 1) return points;
  if (!Number.isFinite(spacing) || spacing <= 0) return points.slice();
  const sampled: Point[] = [points[0]!];

  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    let start = points[i - 1]!;
    const end = points[i]!;
    let segLen = distance(start, end);
    if (segLen === 0) continue;

    while (carry + segLen >= spacing) {
      const remain = spacing - carry;
      const t = remain / segLen;
      const next: Point = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
      sampled.push(next);
      start = next;
      segLen = distance(start, end);
      carry = 0;
      if (segLen === 0) break;
    }

    carry += segLen;
  }

  const last = points[points.length - 1]!;
  const prev = sampled[sampled.length - 1];
  if (!prev || prev.x !== last.x || prev.y !== last.y) sampled.push(last);

  return sampled;
}

/**
 * Convert a base stroke width in world units to screen pixels, accounting
 * for zoom and device pixel ratio, clamped to [minPx, maxPx].
 */
export function screenStrokePx(
  baseWorldWidth: number,
  zoom: number,
  dpr: number,
  minPx = MIN_SCREEN_STROKE_PX,
  maxPx = MAX_SCREEN_STROKE_PX,
): number {
  return clamp(baseWorldWidth * zoom * dpr, minPx, maxPx);
}

/** Bounding box in world coordinates. */
export interface BBox {
  minX: number; minY: number; maxX: number; maxY: number;
}

/**
 * Compute camera position & zoom to fit a world-space bounding box inside a
 * viewport of the given pixel dimensions.
 * @param padding fraction of viewport used (default 0.9 = 10% margin), clamped to [0.1, 1.0].
 */
export function computeFitCamera(
  bbox: BBox,
  viewportWidth: number,
  viewportHeight: number,
  minZoom: number,
  maxZoom: number,
  padding?: number,
): { x: number; y: number; zoom: number } | null {
  const bboxW = bbox.maxX - bbox.minX;
  const bboxH = bbox.maxY - bbox.minY;
  if (bboxW <= 0 || bboxH <= 0) return null;
  const p = Number.isFinite(padding as number) ? clamp(padding!, 0.1, 1.0) : 0.9;
  const zoom = clamp(
    Math.min(viewportWidth / bboxW, viewportHeight / bboxH) * p,
    minZoom,
    maxZoom,
  );
  const cx = bbox.minX + bboxW / 2;
  const cy = bbox.minY + bboxH / 2;
  return {
    x: viewportWidth / 2 - cx * zoom,
    y: viewportHeight / 2 - cy * zoom,
    zoom,
  };
}
