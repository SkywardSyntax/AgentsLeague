import type { ActiveStroke, StrokeTrajectory } from '@/types/agent';
import { cumulativeLengths, totalLength } from './geometry';

export const STROKE_SPEED_PX_PER_SECOND = 180;

/**
 * Computes animation duration for a stroke of the given path length.
 * Clamped to [220, 2600] ms based on {@link STROKE_SPEED_PX_PER_SECOND}.
 */
export function strokeDurationMs(length: number): number {
  const raw = (length / STROKE_SPEED_PX_PER_SECOND) * 1000;
  return Math.min(2600, Math.max(220, raw));
}

/**
 * Converts compiled stroke trajectories into active strokes with animation metadata.
 * Each stroke gets cumulative lengths for progressive rendering and a clamped duration.
 */
export function createActiveBatch(
  strokes: StrokeTrajectory[],
  startedAt = performance.now(),
): ActiveStroke[] {
  return strokes.map((stroke) => {
    const cumulative = cumulativeLengths(stroke.points);
    const length = totalLength(stroke.points);
    return {
      ...stroke,
      startedAt,
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
