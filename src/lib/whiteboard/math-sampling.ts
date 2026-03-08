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

/** Result of sampling a function, with optional diagnostic warnings. */
export interface SampleResult {
  segments: Point[][];
  warnings: string[];
}

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
  return sampleFunctionWithWarnings(fn, xMin, xMax, steps, maxSlope).segments;
}

/**
 * Like {@link sampleFunction} but returns a {@link SampleResult} that
 * includes diagnostic warnings when the expression is mostly or entirely
 * undefined on the sampled domain.
 */
export function sampleFunctionWithWarnings(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
  steps: number,
  maxSlope: number = DEFAULT_MAX_SLOPE,
): SampleResult {
  const n = Math.max(2, Math.round(steps));
  const dx = (xMax - xMin) / (n - 1);
  const slopeThreshold = Math.abs(maxSlope * dx);

  const segments: Point[][] = [];
  let current: Point[] = [];
  let finiteCount = 0;

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

    finiteCount++;

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

  const warnings: string[] = [];
  if (finiteCount === 0) {
    warnings.push('Expression is undefined on this domain');
  } else if (finiteCount < n * 0.5) {
    warnings.push('Expression produced mostly undefined values — check for domain issues');
  }

  return { segments, warnings };
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
// Mathematical constant detection & formatting
// ---------------------------------------------------------------------------

const PI = Math.PI;
const E = Math.E;
const SQRT2 = Math.SQRT2;
const TOLERANCE = 0.01;

/** Known multiples of π to detect, mapping multiplier → display string. */
const PI_MULTIPLES: { mult: number; label: string; latex: string }[] = [
  { mult: -2,    label: '-2π',   latex: '-2\\pi' },
  { mult: -3/2,  label: '-3π/2', latex: '-\\frac{3\\pi}{2}' },
  { mult: -1,    label: '-π',    latex: '-\\pi' },
  { mult: -1/2,  label: '-π/2',  latex: '-\\frac{\\pi}{2}' },
  { mult: -1/4,  label: '-π/4',  latex: '-\\frac{\\pi}{4}' },
  { mult: -1/3,  label: '-π/3',  latex: '-\\frac{\\pi}{3}' },
  { mult: -2/3,  label: '-2π/3', latex: '-\\frac{2\\pi}{3}' },
  { mult: -3/4,  label: '-3π/4', latex: '-\\frac{3\\pi}{4}' },
  { mult: 1/4,   label: 'π/4',   latex: '\\frac{\\pi}{4}' },
  { mult: 1/3,   label: 'π/3',   latex: '\\frac{\\pi}{3}' },
  { mult: 1/2,   label: 'π/2',   latex: '\\frac{\\pi}{2}' },
  { mult: 2/3,   label: '2π/3',  latex: '\\frac{2\\pi}{3}' },
  { mult: 3/4,   label: '3π/4',  latex: '\\frac{3\\pi}{4}' },
  { mult: 1,     label: 'π',     latex: '\\pi' },
  { mult: 3/2,   label: '3π/2',  latex: '\\frac{3\\pi}{2}' },
  { mult: 2,     label: '2π',    latex: '2\\pi' },
];

/** Known multiples of e to detect. */
const E_MULTIPLES: { mult: number; label: string; latex: string }[] = [
  { mult: -2, label: '-2e', latex: '-2e' },
  { mult: -1, label: '-e',  latex: '-e' },
  { mult: 1,  label: 'e',   latex: 'e' },
  { mult: 2,  label: '2e',  latex: '2e' },
];

/** Known fractions for LaTeX conversion. */
const KNOWN_FRACTIONS: { value: number; latex: string }[] = [
  { value: 1/2,  latex: '\\frac{1}{2}' },
  { value: 1/3,  latex: '\\frac{1}{3}' },
  { value: 2/3,  latex: '\\frac{2}{3}' },
  { value: 1/4,  latex: '\\frac{1}{4}' },
  { value: 3/4,  latex: '\\frac{3}{4}' },
  { value: 1/5,  latex: '\\frac{1}{5}' },
  { value: 2/5,  latex: '\\frac{2}{5}' },
  { value: 3/5,  latex: '\\frac{3}{5}' },
  { value: 4/5,  latex: '\\frac{4}{5}' },
  { value: 1/6,  latex: '\\frac{1}{6}' },
  { value: 5/6,  latex: '\\frac{5}{6}' },
  { value: 1/8,  latex: '\\frac{1}{8}' },
  { value: 3/8,  latex: '\\frac{3}{8}' },
  { value: 5/8,  latex: '\\frac{5}{8}' },
  { value: 7/8,  latex: '\\frac{7}{8}' },
];

/**
 * Format a tick value as a human-readable label.
 *
 * - Integer values → "0", "1", "-3"
 * - Multiples of π (within tolerance) → "π/2", "π", "3π/2", etc.
 * - Multiples of e → "e", "2e"
 * - Simple decimals → "0.5", "0.25"
 * - Very small / very large → scientific notation
 */
export function formatTickLabel(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  // Zero
  if (value === 0) return '0';

  // Check multiples of π
  for (const pm of PI_MULTIPLES) {
    if (Math.abs(value - pm.mult * PI) < TOLERANCE) {
      return pm.label;
    }
  }

  // Check multiples of e
  for (const em of E_MULTIPLES) {
    if (Math.abs(value - em.mult * E) < TOLERANCE) {
      return em.label;
    }
  }

  // Integer values (but still use scientific notation for very large)
  if (Number.isInteger(value)) {
    const abs = Math.abs(value);
    if (abs >= 1e6) return value.toExponential(2);
    return String(value);
  }

  // Very small or very large → scientific notation
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 0.001 || abs >= 1e6)) {
    return value.toExponential(2);
  }

  // Simple decimal
  return String(parseFloat(value.toPrecision(10)));
}

/**
 * Convert a numeric value to its best LaTeX representation.
 *
 * - 0.5 → "\\frac{1}{2}"
 * - π/2 → "\\frac{\\pi}{2}"
 * - √2/2 → "\\frac{\\sqrt{2}}{2}"
 * - Integers → the number as a string
 * - Otherwise → decimal string
 */
export function toLatex(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  // Zero
  if (value === 0) return '0';

  // Integers
  if (Number.isInteger(value)) return String(value);

  // Check multiples of π
  for (const pm of PI_MULTIPLES) {
    if (Math.abs(value - pm.mult * PI) < TOLERANCE) {
      return pm.latex;
    }
  }

  // Check multiples of e
  for (const em of E_MULTIPLES) {
    if (Math.abs(value - em.mult * E) < TOLERANCE) {
      return em.latex;
    }
  }

  // Check √2/2
  if (Math.abs(value - SQRT2 / 2) < TOLERANCE) return '\\frac{\\sqrt{2}}{2}';
  if (Math.abs(value + SQRT2 / 2) < TOLERANCE) return '-\\frac{\\sqrt{2}}{2}';

  // Check known simple fractions (positive and negative)
  const sign = value < 0 ? '-' : '';
  const absVal = Math.abs(value);
  for (const frac of KNOWN_FRACTIONS) {
    if (Math.abs(absVal - frac.value) < TOLERANCE) {
      return sign + frac.latex;
    }
  }

  // Fallback to decimal
  return String(parseFloat(value.toPrecision(10)));
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
      label: formatTickLabel(snapped),
    });
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// computeArrowHead
// ---------------------------------------------------------------------------

/** Style of arrowhead rendering. */
export type ArrowHeadStyle = 'filled' | 'open';

export interface ArrowHeadResult {
  left: { x: number; y: number };
  right: { x: number; y: number };
  /** The style requested (default 'filled'). Renderers can use this to choose
   *  between a filled triangle or two open wing lines. */
  style: ArrowHeadStyle;
}

/**
 * Compute the two wing-tip points for an arrowhead at the tip of a vector
 * from `from` to `to`.
 *
 * The arrowhead scales proportionally with `lineWidth` so that thicker
 * strokes get proportionally larger heads.  The base head length is
 * `headLength`; the effective length used is
 *   `headLength * clamp(lineWidth / 1.5, 0.6, 3.0)`
 * which keeps arrowheads visually balanced across a wide range of widths.
 *
 * @param from       Tail of the vector.
 * @param to         Tip of the vector (where the arrowhead sits).
 * @param headLength Base length of each arrowhead wing in world units.
 * @param headAngle  Half-angle of the arrowhead opening (default π/6 = 30°).
 * @param lineWidth  Stroke width of the line, used for proportional scaling (default 1.5).
 * @param style      'filled' (solid triangle, default) or 'open' (two wing lines).
 */
export function computeArrowHead(
  from: { x: number; y: number },
  to: { x: number; y: number },
  headLength: number,
  headAngle: number = Math.PI / 6,
  lineWidth: number = 1.5,
  style: ArrowHeadStyle = 'filled',
): ArrowHeadResult {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  // Scale head proportionally with line width (reference width = 1.5)
  const widthScale = Math.min(3.0, Math.max(0.6, lineWidth / 1.5));
  const effectiveLen = headLength * widthScale;

  return {
    left: {
      x: to.x - effectiveLen * Math.cos(angle - headAngle),
      y: to.y - effectiveLen * Math.sin(angle - headAngle),
    },
    right: {
      x: to.x - effectiveLen * Math.cos(angle + headAngle),
      y: to.y - effectiveLen * Math.sin(angle + headAngle),
    },
    style,
  };
}
