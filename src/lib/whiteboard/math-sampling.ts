import type { Point } from '@/types/agent';

// ---------------------------------------------------------------------------
// Discontinuity detection
// ---------------------------------------------------------------------------

/** Default slope threshold for discontinuity detection (|Δy/Δx|). */
const DEFAULT_MAX_SLOPE = 1e4;

/**
 * Returns true when two adjacent y-samples indicate a discontinuity.
 *
 * A discontinuity is declared when:
 *  1. Either value is non-finite (NaN / ±Infinity), OR
 *  2. The absolute change exceeds `threshold`.
 */
function hasDiscontinuity(
  y1: number,
  y2: number,
  threshold: number,
): boolean {
  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return true;
  return Math.abs(y2 - y1) > threshold;
}

// ---------------------------------------------------------------------------
// sampleFunction
// ---------------------------------------------------------------------------

/**
 * Sample y=f(x) over [xMin, xMax] with automatic discontinuity splitting.
 *
 * Returns **multiple** Point[] segments so that each continuous arc can be
 * drawn as a separate stroke — no visual bridging across asymptotes.
 *
 * Detection strategy:
 *  - Non-finite values (NaN, ±Infinity) always break the segment.
 *  - Large-slope jumps (|Δy / Δx| > maxSlope) break the segment.
 *
 * @param fn        The mathematical function to sample.
 * @param xMin      Left bound of the domain.
 * @param xMax      Right bound of the domain.
 * @param steps     Number of evenly-spaced samples (≥2).
 * @param maxSlope  Slope magnitude above which a discontinuity is declared.
 */
export function sampleFunction(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
  steps: number,
  maxSlope: number = DEFAULT_MAX_SLOPE,
): Point[][] {
  const n = Math.max(2, Math.round(steps));
  const dx = (xMax - xMin) / (n - 1);
  const slopeThreshold = Math.abs(maxSlope * dx);

  const segments: Point[][] = [];
  let current: Point[] = [];

  let prevY: number | undefined;

  for (let i = 0; i < n; i++) {
    const x = xMin + i * dx;
    const y = fn(x);

    if (!Number.isFinite(y)) {
      // non-finite → end current segment, skip this sample
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      prevY = undefined;
      continue;
    }

    if (prevY !== undefined && hasDiscontinuity(prevY, y, slopeThreshold)) {
      // slope discontinuity → end current segment, start a new one
      if (current.length > 0) {
        segments.push(current);
      }
      current = [{ x, y }];
    } else {
      current.push({ x, y });
    }

    prevY = y;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

// ---------------------------------------------------------------------------
// sampleParametric
// ---------------------------------------------------------------------------

/**
 * Sample a parametric curve (x(t), y(t)) over [tMin, tMax] with
 * discontinuity splitting identical to {@link sampleFunction}.
 *
 * Both x and y must be finite for a point to be included; large jumps
 * in either coordinate trigger a segment break.
 */
export function sampleParametric(
  xFn: (t: number) => number,
  yFn: (t: number) => number,
  tMin: number,
  tMax: number,
  steps: number,
  maxJump: number = DEFAULT_MAX_SLOPE,
): Point[][] {
  const n = Math.max(2, Math.round(steps));
  const dt = (tMax - tMin) / (n - 1);
  const jumpThreshold = Math.abs(maxJump * dt);

  const segments: Point[][] = [];
  let current: Point[] = [];
  let prev: Point | undefined;

  for (let i = 0; i < n; i++) {
    const t = tMin + i * dt;
    const x = xFn(t);
    const y = yFn(t);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      prev = undefined;
      continue;
    }

    const pt: Point = { x, y };

    if (prev !== undefined) {
      const jump = Math.hypot(x - prev.x, y - prev.y);
      if (jump > jumpThreshold) {
        if (current.length > 0) {
          segments.push(current);
        }
        current = [pt];
        prev = pt;
        continue;
      }
    }

    current.push(pt);
    prev = pt;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

// ---------------------------------------------------------------------------
// tickMarksForRange
// ---------------------------------------------------------------------------

/**
 * Compute human-friendly tick positions for an axis spanning [min, max].
 *
 * The algorithm picks a "nice" step size (1, 2, or 5 × 10^k) so the
 * resulting tick count is close to `targetCount`.
 */
export function tickMarksForRange(
  min: number,
  max: number,
  targetCount: number,
): { value: number; label: string }[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || targetCount < 1) {
    return [];
  }

  const range = max - min;
  const roughStep = range / Math.max(1, targetCount);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));

  // Pick from the "nice" set {1, 2, 5} × magnitude
  const candidates = [1, 2, 5, 10];
  let step = magnitude;
  for (const c of candidates) {
    const s = c * magnitude;
    if (s >= roughStep) {
      step = s;
      break;
    }
  }

  // Determine decimal places for formatting
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const start = Math.ceil(min / step) * step;

  const ticks: { value: number; label: string }[] = [];
  // Safety cap to prevent infinite loops from degenerate inputs
  const maxTicks = Math.max(targetCount * 3, 50);

  for (let v = start; v <= max && ticks.length < maxTicks; v += step) {
    // Snap near-zero values to exactly 0 to avoid "-0" labels
    const snapped = Math.abs(v) < step * 1e-9 ? 0 : v;
    ticks.push({
      value: snapped,
      label: snapped.toFixed(decimals),
    });
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// computeArrowHead
// ---------------------------------------------------------------------------

/**
 * Compute the two wing-tip points for an arrowhead at the tip of a vector
 * from `from` to `to`.
 *
 * @param from       Tail of the vector.
 * @param to         Tip of the vector (where the arrowhead sits).
 * @param headLength Length of each arrowhead wing in world units.
 * @param headAngle  Half-angle of the arrowhead opening (default π/6 = 30°).
 */
export function computeArrowHead(
  from: { x: number; y: number },
  to: { x: number; y: number },
  headLength: number,
  headAngle: number = Math.PI / 6,
): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  return {
    left: {
      x: to.x - headLength * Math.cos(angle - headAngle),
      y: to.y - headLength * Math.sin(angle - headAngle),
    },
    right: {
      x: to.x - headLength * Math.cos(angle + headAngle),
      y: to.y - headLength * Math.sin(angle + headAngle),
    },
  };
}
