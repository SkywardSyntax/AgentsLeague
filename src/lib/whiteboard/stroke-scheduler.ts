import type { ActiveStroke, Point, StrokeTrajectory } from '@/types/agent';
import { cumulativeLengths, distance, totalLength } from './geometry';

export const STROKE_SPEED_PX_PER_SECOND = 180;

export function strokeDurationMs(length: number): number {
  const raw = (length / STROKE_SPEED_PX_PER_SECOND) * 1000;
  return Math.min(2600, Math.max(220, raw));
}

export type Clock = () => number;

export const defaultClock: Clock = () => performance.now();

export function createActiveBatch(
  strokes: StrokeTrajectory[],
  startedAt?: number,
  clock: Clock = defaultClock,
): ActiveStroke[] {
  const start = startedAt ?? clock();
  return strokes.map((stroke) => {
    const cumulative = cumulativeLengths(stroke.points);
    const length = totalLength(stroke.points);
    return {
      ...stroke,
      startedAt: start,
      durationMs: strokeDurationMs(length),
      length,
      cumulativeLengths: cumulative,
    };
  });
}

/** Staggered batch: each stroke starts after `staggerMs` delay from the previous */
export function createStaggeredBatch(
  strokes: StrokeTrajectory[],
  staggerMs: number,
  startedAt?: number,
  clock: Clock = defaultClock,
): ActiveStroke[] {
  const baseStart = startedAt ?? clock();
  return strokes.map((stroke, index) => {
    const cumulative = cumulativeLengths(stroke.points);
    const length = totalLength(stroke.points);
    return {
      ...stroke,
      startedAt: baseStart + index * staggerMs,
      durationMs: strokeDurationMs(length),
      length,
      cumulativeLengths: cumulative,
    };
  });
}

// --- Easing functions ---

export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

export function easeInOutQuad(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5
    ? 2 * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
}

export function easeOutQuart(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 4);
}

export function easeInOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

export type EasingFn = (t: number) => number;

export const EASING_MAP: Record<string, EasingFn> = {
  easeOutCubic,
  easeInOutQuad,
  easeOutQuart,
  easeInOutCubic,
};

/**
 * Compute a per-point speed factor based on corner sharpness.
 * Returns values in [minFactor, 1]: sharp corners get slower (lower factor),
 * straight segments stay at 1.
 */
export function cornerSpeedFactors(
  points: Point[],
  minFactor = 0.35,
): number[] {
  if (points.length <= 2) return points.map(() => 1);

  const factors: number[] = [1];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;

    const d1 = distance(prev, curr);
    const d2 = distance(curr, next);
    if (d1 === 0 || d2 === 0) {
      factors.push(minFactor);
      continue;
    }

    // Dot product of incoming and outgoing direction vectors
    const ax = curr.x - prev.x;
    const ay = curr.y - prev.y;
    const bx = next.x - curr.x;
    const by = next.y - curr.y;
    const dot = (ax * bx + ay * by) / (d1 * d2);
    // dot=1 → straight, dot=-1 → 180° turn
    // Map from [-1,1] to [minFactor, 1]
    const normalized = (dot + 1) / 2; // 0..1
    factors.push(minFactor + normalized * (1 - minFactor));
  }
  factors.push(1);

  return factors;
}
