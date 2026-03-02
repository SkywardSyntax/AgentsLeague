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
  if (points.length <= 1 || spacing <= 0) return points;
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

// --- Bounds ---

export interface StrokeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export function strokesBoundingBox(
  strokes: { points: Point[] }[],
  padding = 0,
): StrokeBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  const pad = Math.max(0, padding);
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
    width: Math.max(0, maxX - minX + pad * 2),
    height: Math.max(0, maxY - minY + pad * 2),
  };
}

// --- Bézier curves ---

export interface BezierSegment {
  p0: Point;
  cp1: Point;
  cp2: Point;
  p3: Point;
}

export function bezierPointAt(seg: BezierSegment, t: number): Point {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * seg.p0.x + 3 * uu * t * seg.cp1.x + 3 * u * tt * seg.cp2.x + ttt * seg.p3.x,
    y: uuu * seg.p0.y + 3 * uu * t * seg.cp1.y + 3 * u * tt * seg.cp2.y + ttt * seg.p3.y,
  };
}

export function bezierLength(seg: BezierSegment, subdivisions = 16): number {
  let len = 0;
  let prev = seg.p0;
  for (let i = 1; i <= subdivisions; i++) {
    const pt = bezierPointAt(seg, i / subdivisions);
    len += distance(prev, pt);
    prev = pt;
  }
  return len;
}

export function bezierPointAtArcLength(
  seg: BezierSegment,
  targetLen: number,
  totalLen?: number,
  subdivisions = 32,
): Point {
  if (targetLen <= 0) return { x: seg.p0.x, y: seg.p0.y };
  const total = totalLen ?? bezierLength(seg, subdivisions);
  if (total <= 0 || targetLen >= total) return { x: seg.p3.x, y: seg.p3.y };

  let accumulated = 0;
  let prev = seg.p0;
  for (let i = 1; i <= subdivisions; i++) {
    const t = i / subdivisions;
    const pt = bezierPointAt(seg, t);
    const segLen = distance(prev, pt);
    if (accumulated + segLen >= targetLen) {
      const overshoot = targetLen - accumulated;
      const frac = segLen > 0 ? overshoot / segLen : 0;
      return {
        x: prev.x + (pt.x - prev.x) * frac,
        y: prev.y + (pt.y - prev.y) * frac,
      };
    }
    accumulated += segLen;
    prev = pt;
  }
  return { x: seg.p3.x, y: seg.p3.y };
}

export function bezierChainLength(segs: BezierSegment[]): number {
  let total = 0;
  for (const seg of segs) {
    total += bezierLength(seg);
  }
  return total;
}

export function catmullRomToBezier(points: Point[], tension = 0.5): BezierSegment[] {
  if (points.length < 2) return [];
  const alpha = clamp(tension, 0.01, 1);
  const segs: BezierSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1]! : { x: 2 * points[0]!.x - points[1]!.x, y: 2 * points[0]!.y - points[1]!.y };
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = i + 2 < points.length ? points[i + 2]! : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };

    const cp1: Point = {
      x: p1.x + (p2.x - p0.x) / (6 / alpha),
      y: p1.y + (p2.y - p0.y) / (6 / alpha),
    };
    const cp2: Point = {
      x: p2.x - (p3.x - p1.x) / (6 / alpha),
      y: p2.y - (p3.y - p1.y) / (6 / alpha),
    };

    segs.push({ p0: p1, cp1, cp2, p3: p2 });
  }

  return segs;
}
