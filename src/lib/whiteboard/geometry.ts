import type { Point } from '@/types/agent';

export const MIN_SCREEN_STROKE_PX = 1.25;
export const MAX_SCREEN_STROKE_PX = 5.5;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function cumulativeLengths(points: Point[]): number[] {
  if (points.length === 0) return [];
  const out: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    out.push((out[i - 1] ?? 0) + distance(points[i - 1]!, points[i]!));
  }
  return out;
}

export function totalLength(points: Point[]): number {
  const lengths = cumulativeLengths(points);
  return lengths[lengths.length - 1] ?? 0;
}

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

export function resamplePolyline(points: Point[], spacing: number): Point[] {
  if (points.length <= 1) return points;
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

export function screenStrokePx(
  baseWorldWidth: number,
  zoom: number,
  dpr: number,
  minPx = MIN_SCREEN_STROKE_PX,
  maxPx = MAX_SCREEN_STROKE_PX,
): number {
  return clamp(baseWorldWidth * zoom * dpr, minPx, maxPx);
}
