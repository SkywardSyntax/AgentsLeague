/**
 * Coordinate validator — prevent crafted coordinates from causing
 * buffer overflows, memory exhaustion, or DoS in the canvas subsystem.
 */

import { COORD_BOUNDS } from './clamp-coordinates';

const MAX_POINTS_PER_STROKE = 10_000;
const MAX_STROKES_PER_BATCH = 500;
const MIN_POINT_DISTANCE = 0.01;
const MAX_COORDINATE_VALUE = 1_000_000;
const MAX_DENSITY_PER_UNIT = 100; // max points per 1x1 area

export interface CoordinateValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Point {
  x: number;
  y: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validatePoint(point: unknown): CoordinateValidationResult {
  const errors: string[] = [];

  if (point === null || point === undefined || typeof point !== 'object') {
    return { valid: false, errors: ['Point must be a non-null object'] };
  }

  const p = point as Record<string, unknown>;

  if (!isFiniteNumber(p.x)) {
    errors.push(`Invalid x coordinate: ${String(p.x)}`);
  }
  if (!isFiniteNumber(p.y)) {
    errors.push(`Invalid y coordinate: ${String(p.y)}`);
  }

  if (errors.length > 0) return { valid: false, errors };

  const x = p.x as number;
  const y = p.y as number;

  if (Math.abs(x) > MAX_COORDINATE_VALUE) {
    errors.push(`x coordinate ${x} exceeds maximum absolute value of ${MAX_COORDINATE_VALUE}`);
  }
  if (Math.abs(y) > MAX_COORDINATE_VALUE) {
    errors.push(`y coordinate ${y} exceeds maximum absolute value of ${MAX_COORDINATE_VALUE}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validatePointArray(points: unknown): CoordinateValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(points)) {
    return { valid: false, errors: ['Points must be an array'] };
  }

  if (points.length > MAX_POINTS_PER_STROKE) {
    errors.push(`Too many points: ${points.length} exceeds limit of ${MAX_POINTS_PER_STROKE}`);
    return { valid: false, errors };
  }

  for (let i = 0; i < points.length; i++) {
    const result = validatePoint(points[i]);
    if (!result.valid) {
      errors.push(`Point[${i}]: ${result.errors.join(', ')}`);
      if (errors.length >= 10) {
        errors.push('... (truncated, too many errors)');
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateBatchSize(strokeCount: number): CoordinateValidationResult {
  if (!isFiniteNumber(strokeCount) || strokeCount < 0) {
    return { valid: false, errors: ['Stroke count must be a non-negative finite number'] };
  }
  if (strokeCount > MAX_STROKES_PER_BATCH) {
    return {
      valid: false,
      errors: [`Batch size ${strokeCount} exceeds limit of ${MAX_STROKES_PER_BATCH}`],
    };
  }
  return { valid: true, errors: [] };
}

export function detectDuplicatePoints(points: Point[]): {
  hasDuplicates: boolean;
  duplicateCount: number;
} {
  let duplicateCount = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const dx = Math.abs(curr.x - prev.x);
    const dy = Math.abs(curr.y - prev.y);
    if (dx < MIN_POINT_DISTANCE && dy < MIN_POINT_DISTANCE) {
      duplicateCount++;
    }
  }
  return { hasDuplicates: duplicateCount > 0, duplicateCount };
}

export function detectPathologicalDensity(
  points: Point[],
  maxPerUnit: number = MAX_DENSITY_PER_UNIT,
): { pathological: boolean; maxDensity: number } {
  if (points.length < 2) return { pathological: false, maxDensity: 0 };

  // Use a grid-based density check
  const grid = new Map<string, number>();
  let maxDensity = 0;

  for (const p of points) {
    const gx = Math.floor(p.x);
    const gy = Math.floor(p.y);
    const key = `${gx},${gy}`;
    const count = (grid.get(key) ?? 0) + 1;
    grid.set(key, count);
    if (count > maxDensity) maxDensity = count;
  }

  return { pathological: maxDensity > maxPerUnit, maxDensity };
}

export function clampPoint(point: Point): Point {
  return {
    x: Math.max(COORD_BOUNDS.MIN_X, Math.min(COORD_BOUNDS.MAX_X, point.x)),
    y: Math.max(COORD_BOUNDS.MIN_Y, Math.min(COORD_BOUNDS.MAX_Y, point.y)),
  };
}

export function sanitizePointArray(points: Point[]): Point[] {
  const validated = points
    .filter((p) => isFiniteNumber(p.x) && isFiniteNumber(p.y))
    .slice(0, MAX_POINTS_PER_STROKE)
    .map(clampPoint);
  return validated;
}
