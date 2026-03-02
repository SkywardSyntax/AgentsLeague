import { COORD_BOUNDS } from './clamp-coordinates';
import { clamp, distance } from './geometry';
import type { Point, DrawElement, WhiteboardBounds } from '@/types/agent';

export interface SafeResult<T> {
  value: T;
  overflowed: boolean;
}

function safeClampX(value: number): { value: number; overflowed: boolean } {
  if (Number.isNaN(value)) return { value: COORD_BOUNDS.MIN_X, overflowed: true };
  const clamped = clamp(value, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X);
  return { value: clamped, overflowed: clamped !== value };
}

function safeClampY(value: number): { value: number; overflowed: boolean } {
  if (Number.isNaN(value)) return { value: COORD_BOUNDS.MIN_Y, overflowed: true };
  const clamped = clamp(value, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y);
  return { value: clamped, overflowed: clamped !== value };
}

export function safeAdd(a: number, b: number): SafeResult<number> {
  const raw = a + b;
  const result = safeClampX(raw);
  return { value: result.value, overflowed: result.overflowed };
}

export function safeMul(a: number, b: number): SafeResult<number> {
  const raw = a * b;
  const result = safeClampX(raw);
  return { value: result.value, overflowed: result.overflowed };
}

export function safeDist(p1: Point, p2: Point): SafeResult<number> {
  const raw = distance(p1, p2);
  const result = safeClampX(raw);
  return { value: result.value, overflowed: result.overflowed };
}

export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function safeTransformPoint(
  point: Point,
  matrix: AffineMatrix,
): SafeResult<Point> {
  const rawX = matrix.a * point.x + matrix.c * point.y + matrix.tx;
  const rawY = matrix.b * point.x + matrix.d * point.y + matrix.ty;

  const cx = safeClampX(rawX);
  const cy = safeClampY(rawY);

  return {
    value: { x: cx.value, y: cy.value },
    overflowed: cx.overflowed || cy.overflowed,
  };
}

function elementExtremes(
  el: DrawElement,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  switch (el.type) {
    case 'rect':
      return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
    case 'ellipse':
      return {
        minX: el.cx - el.rx,
        minY: el.cy - el.ry,
        maxX: el.cx + el.rx,
        maxY: el.cy + el.ry,
      };
    case 'line':
    case 'arrow':
      return {
        minX: Math.min(el.from.x, el.to.x),
        minY: Math.min(el.from.y, el.to.y),
        maxX: Math.max(el.from.x, el.to.x),
        maxY: Math.max(el.from.y, el.to.y),
      };
    case 'text':
    case 'latex':
      return { minX: el.x, minY: el.y, maxX: el.x, maxY: el.y };
    default:
      return null;
  }
}

export function safeBoundingBox(
  elements: DrawElement[],
): SafeResult<WhiteboardBounds> {
  let overflowed = false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const ext = elementExtremes(el);
    if (!ext) continue;
    minX = Math.min(minX, ext.minX);
    minY = Math.min(minY, ext.minY);
    maxX = Math.max(maxX, ext.maxX);
    maxY = Math.max(maxY, ext.maxY);
  }

  if (!Number.isFinite(minX)) {
    overflowed = true;
    minX = clamp(minX === Infinity ? 0 : minX, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X);
  }
  if (!Number.isFinite(minY)) {
    overflowed = true;
    minY = clamp(minY === Infinity ? 0 : minY, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y);
  }
  if (!Number.isFinite(maxX)) {
    overflowed = true;
    maxX = clamp(maxX === -Infinity ? 0 : maxX, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X);
  }
  if (!Number.isFinite(maxY)) {
    overflowed = true;
    maxY = clamp(maxY === -Infinity ? 0 : maxY, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y);
  }

  const cMinX = safeClampX(minX);
  const cMinY = safeClampY(minY);
  const cMaxX = safeClampX(maxX);
  const cMaxY = safeClampY(maxY);

  if (cMinX.overflowed || cMinY.overflowed || cMaxX.overflowed || cMaxY.overflowed) {
    overflowed = true;
  }

  return {
    value: {
      minX: cMinX.value,
      minY: cMinY.value,
      maxX: cMaxX.value,
      maxY: cMaxY.value,
    },
    overflowed,
  };
}

export function overflowReport(
  results: SafeResult<unknown>[],
): { count: number; overflowCount: number; overflowRate: number } {
  const count = results.length;
  const overflowCount = results.filter((r) => r.overflowed).length;
  return {
    count,
    overflowCount,
    overflowRate: count > 0 ? overflowCount / count : 0,
  };
}
