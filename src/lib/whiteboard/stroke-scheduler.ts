import type { ActiveStroke, StrokeTrajectory } from '@/types/agent';
import { cumulativeLengths, totalLength } from './geometry';

export const STROKE_SPEED_PX_PER_SECOND = 180;

export function strokeDurationMs(length: number): number {
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
): ActiveStroke[] {
  const times = stagger
    ? staggeredStartTimes(strokes.length, startedAt)
    : null;
  return strokes.map((stroke, i) => {
    const cumulative = cumulativeLengths(stroke.points);
    const length = totalLength(stroke.points);
    return {
      ...stroke,
      startedAt: times ? times[i]! : startedAt,
      durationMs: strokeDurationMs(length),
      length,
      cumulativeLengths: cumulative,
    };
  });
}

export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}
