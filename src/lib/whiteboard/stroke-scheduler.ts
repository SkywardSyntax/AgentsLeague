import type { ActiveStroke, StrokeTrajectory } from '@/types/agent';
import { cumulativeLengths, totalLength } from './geometry';

export const STROKE_SPEED_PX_PER_SECOND = 180;

/** Runtime check for prefers-reduced-motion; re-evaluated on every call so it
 *  picks up live OS setting changes. Safe for SSR (returns false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function strokeDurationMs(length: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  const raw = (length / STROKE_SPEED_PX_PER_SECOND) * 1000;
  return Math.min(2600, Math.max(220, raw));
}

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

export function createActiveBatch(
  strokes: StrokeTrajectory[],
  startedAt = performance.now(),
  stagger = false,
  reducedMotion = false,
): ActiveStroke[] {
  const valid = strokes.filter((s) => s.points.length >= 2);
  const times = stagger && !reducedMotion
    ? staggeredStartTimes(valid.length, startedAt)
    : null;
  return valid.map((stroke, i) => {
    const cumulative = cumulativeLengths(stroke.points);
    const length = totalLength(stroke.points);
    return {
      ...stroke,
      startedAt: times ? times[i]! : startedAt,
      durationMs: strokeDurationMs(length, reducedMotion),
      length,
      cumulativeLengths: cumulative,
    };
  });
}

export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}
