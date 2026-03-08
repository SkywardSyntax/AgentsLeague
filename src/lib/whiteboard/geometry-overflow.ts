import { COORD_BOUNDS } from './clamp-coordinates';
import type { DrawElement } from '@/types/agent';

interface SafeResult<T> {
  value: T;
  overflowed: boolean;
}

function clampValue(v: number): { value: number; overflowed: boolean } {
  if (Number.isNaN(v) || !Number.isFinite(v)) {
    return { value: v > 0 || Number.isNaN(v) ? COORD_BOUNDS.MIN_X : COORD_BOUNDS.MIN_X, overflowed: true };
  }
  if (v > COORD_BOUNDS.MAX_X) return { value: COORD_BOUNDS.MAX_X, overflowed: true };
  if (v < COORD_BOUNDS.MIN_X) return { value: COORD_BOUNDS.MIN_X, overflowed: true };
  return { value: v, overflowed: false };
}

export function safeAdd(a: number, b: number): SafeResult<number> {
  if (Number.isNaN(a) || Number.isNaN(b)) return { value: COORD_BOUNDS.MIN_X, overflowed: true };
  return clampValue(a + b);
}

export function safeMul(a: number, b: number): SafeResult<number> {
  if (Number.isNaN(a) || Number.isNaN(b)) return { value: COORD_BOUNDS.MIN_X, overflowed: true };
  return clampValue(a * b);
}

export function safeDist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): SafeResult<number> {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return clampValue(d);
}

interface Matrix2D {
  a: number; b: number;
  c: number; d: number;
  tx: number; ty: number;
}

export function safeTransformPoint(
  point: { x: number; y: number },
  matrix: Matrix2D,
): SafeResult<{ x: number; y: number }> {
  const rawX = matrix.a * point.x + matrix.c * point.y + matrix.tx;
  const rawY = matrix.b * point.x + matrix.d * point.y + matrix.ty;
  const cx = clampValue(rawX);
  const cy = clampValue(rawY);
  return {
    value: { x: cx.value, y: cy.value },
    overflowed: cx.overflowed || cy.overflowed,
  };
}

export function safeBoundingBox(
  elements: DrawElement[],
): SafeResult<{ minX: number; minY: number; maxX: number; maxY: number }> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let overflowed = false;

  for (const el of elements) {
    if ('x' in el && 'y' in el) {
      const x = el.x as number;
      const y = el.y as number;
      const cx = clampValue(x);
      const cy = clampValue(y);
      if (cx.overflowed || cy.overflowed) overflowed = true;
      if (cx.value < minX) minX = cx.value;
      if (cy.value < minY) minY = cy.value;

      let ex = cx.value;
      let ey = cy.value;
      if ('w' in el) ex += (el as { w: number }).w;
      if ('h' in el) ey += (el as { h: number }).h;
      const cex = clampValue(ex);
      const cey = clampValue(ey);
      if (cex.overflowed || cey.overflowed) overflowed = true;
      if (cex.value > maxX) maxX = cex.value;
      if (cey.value > maxY) maxY = cey.value;
    }
  }

  if (!Number.isFinite(minX)) { minX = COORD_BOUNDS.MIN_X; overflowed = true; }
  if (!Number.isFinite(minY)) { minY = COORD_BOUNDS.MIN_X; overflowed = true; }
  if (!Number.isFinite(maxX)) { maxX = COORD_BOUNDS.MAX_X; overflowed = true; }
  if (!Number.isFinite(maxY)) { maxY = COORD_BOUNDS.MAX_X; overflowed = true; }

  return { value: { minX, minY, maxX, maxY }, overflowed };
}

export function overflowReport(
  results: Array<{ value: unknown; overflowed: boolean }>,
): { count: number; overflowCount: number; overflowRate: number } {
  const count = results.length;
  const overflowCount = results.filter((r) => r.overflowed).length;
  return { count, overflowCount, overflowRate: count === 0 ? 0 : overflowCount / count };
}
