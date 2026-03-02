import type { ActiveStroke, StrokeTrajectory } from '@/types/agent';
import { cumulativeLengths, totalLength } from './geometry';

export const STROKE_SPEED_PX_PER_SECOND = 180;

export function strokeDurationMs(length: number): number {
  const raw = (length / STROKE_SPEED_PX_PER_SECOND) * 1000;
  return Math.min(2600, Math.max(220, raw));
}

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
