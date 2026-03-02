import type { ActiveStroke, Point, StrokeTrajectory } from '@/types/agent';
import { cumulativeLengths, distance, totalLength } from './geometry';

/** Drawing speed used to derive animation duration from stroke path length. */
export const STROKE_SPEED_PX_PER_SECOND = 180;

/**
 * Compute animation duration in ms from stroke path `length` in world pixels.
 * Clamped to [220ms, 2600ms] — short strokes have a minimum visible duration
 * and long strokes cap to avoid excessively slow drawing.
 */

/** Runtime check for prefers-reduced-motion; re-evaluated on every call so it
 *  picks up live OS setting changes. Safe for SSR (returns false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function strokeDurationMs(length: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  if (!Number.isFinite(length) || length < 0) return 220;
  const raw = (length / STROKE_SPEED_PX_PER_SECOND) * 1000;
  return Math.min(2600, Math.max(220, raw));
}


export type Clock = () => number;

export const defaultClock: Clock = () => performance.now();

export const MAX_TOTAL_STAGGER_MS = 800;
const DEFAULT_STAGGER_MS = 60;

export function staggeredStartTimes(
  count: number,
  batchStartedAt: number,
  staggerMs = DEFAULT_STAGGER_MS,
): number[] {
  if (count <= 0) return [];
  const safeStagger = Number.isFinite(staggerMs) && staggerMs > 0
    ? staggerMs
    : DEFAULT_STAGGER_MS;
  const clamped = count > 1
    ? Math.min(safeStagger, MAX_TOTAL_STAGGER_MS / (count - 1))
    : safeStagger;
  return Array.from({ length: count }, (_, i) => batchStartedAt + i * clamped);
}

/**
 * Convert raw `StrokeTrajectory[]` to `ActiveStroke[]` by precomputing
 * cumulative path lengths and animation duration for each stroke.
 * All strokes in the batch share the same `startedAt` timestamp so they
 * animate in parallel (unless stagger is true).
 */
export function createActiveBatch(
  strokes: StrokeTrajectory[],
  startedAt?: number,
  stagger: boolean | Clock = false,
  reducedMotion = false,
): ActiveStroke[] {
  const clock = typeof stagger === 'function' ? stagger : defaultClock;
  const doStagger = typeof stagger === 'boolean' ? stagger : false;
  const start = startedAt ?? clock();
  const valid = strokes.filter((s) => s.points.length >= 2);
  const times = doStagger && !reducedMotion
    ? staggeredStartTimes(valid.length, start)
    : null;
  return valid.map((stroke, i) => {
    const cumulative = cumulativeLengths(stroke.points);
    const length = totalLength(stroke.points);
    const factors = cornerSpeedFactors(stroke.points);
    return {
      ...stroke,
      startedAt: times ? times[i]! : start,
      durationMs: strokeDurationMs(length, reducedMotion),
      length,
      cumulativeLengths: cumulative,
      speedFactors: factors,
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
    const factors = cornerSpeedFactors(stroke.points);
    return {
      ...stroke,
      startedAt: baseStart + index * staggerMs,
      durationMs: strokeDurationMs(length),
      length,
      cumulativeLengths: cumulative,
      speedFactors: factors,
    };
  });
}

// --- Easing functions ---

/**
 * Cubic ease-out: fast start, smooth deceleration. Input `t` is clamped
 * to [0, 1]. Used for progressive stroke reveal animation.
 */
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

/**
 * Compute the visible arc length given a weighted progress t ∈ [0,1].
 * speedFactors < 1 slow the pen (take more time per unit length);
 * this maps eased progress to a real arc-length value using
 * per-segment weighted traversal with explicit binary-search inversion.
 */
export function weightedVisibleLength(
  cumulativeLens: number[],
  speedFactors: number[],
  t: number,
): number {
  if (cumulativeLens.length <= 1 || t <= 0) return 0;
  const totalLen = cumulativeLens[cumulativeLens.length - 1] ?? 0;
  if (t >= 1) return totalLen;

  // Guard: factors array must match cumulative lengths array (one per point)
  if (speedFactors.length !== cumulativeLens.length) {
    return totalLen * t;
  }

  // Build weighted cumulative array: time spent = segLen / speedFactor
  const n = cumulativeLens.length;
  const weightedCum: number[] = [0];
  for (let i = 1; i < n; i++) {
    const segLen = (cumulativeLens[i] ?? 0) - (cumulativeLens[i - 1] ?? 0);
    const rawFactor = speedFactors[i] ?? 1;
    // Guard ÷0 / NaN: fall back to uniform weighting for non-finite or non-positive factors
    const safeWeight =
      Number.isFinite(rawFactor) && rawFactor > 0 ? segLen / rawFactor : segLen;
    weightedCum.push((weightedCum[i - 1] ?? 0) + safeWeight);
  }
  const totalWeighted = weightedCum[n - 1] ?? 0;
  if (totalWeighted <= 0) return totalLen * t;

  const targetWeighted = totalWeighted * t;

  // Binary search to invert: find real arc length for targetWeighted
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if ((weightedCum[mid] ?? 0) <= targetWeighted) lo = mid;
    else hi = mid;
  }

  const wLo = weightedCum[lo] ?? 0;
  const wHi = weightedCum[hi] ?? 0;
  const segWeighted = wHi - wLo;
  const frac = segWeighted > 0 ? (targetWeighted - wLo) / segWeighted : 0;
  const realLo = cumulativeLens[lo] ?? 0;
  const realHi = cumulativeLens[hi] ?? 0;
  return Math.min(realLo + (realHi - realLo) * frac, totalLen);
}
