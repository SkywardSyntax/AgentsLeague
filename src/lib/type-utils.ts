/**
 * Runtime type guards and exhaustiveness helpers.
 */

import type {
  ArrowShape,
  DrawingShape,
  EllipseShape,
  FreehandShape,
  ImageShape,
  LineShape,
  RectangleShape,
  ShapeKind,
  TextShape,
} from '../types/drawing';
import { SHAPE_KINDS } from '../types/drawing';

// ── Exhaustive switch helper ────────────────────────────────────────

/**
 * Used in the `default` branch of a switch over a discriminated union.
 * If a new variant is added but not handled, TypeScript emits a
 * compile-time error because `x` won't be assignable to `never`.
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

// ── Shape kind set (for runtime checks) ─────────────────────────────

const SHAPE_KIND_SET = new Set<string>(SHAPE_KINDS);

// ── General DrawingShape guard ──────────────────────────────────────

export function isDrawingShape(value: unknown): value is DrawingShape {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.kind === 'string' && SHAPE_KIND_SET.has(v.kind);
}

// ── Shape-specific type guards ──────────────────────────────────────

export function isRectangle(shape: DrawingShape): shape is RectangleShape {
  return shape.kind === 'rectangle';
}

export function isEllipse(shape: DrawingShape): shape is EllipseShape {
  return shape.kind === 'ellipse';
}

export function isLine(shape: DrawingShape): shape is LineShape {
  return shape.kind === 'line';
}

export function isArrow(shape: DrawingShape): shape is ArrowShape {
  return shape.kind === 'arrow';
}

export function isFreehand(shape: DrawingShape): shape is FreehandShape {
  return shape.kind === 'freehand';
}

export function isText(shape: DrawingShape): shape is TextShape {
  return shape.kind === 'text';
}

export function isImage(shape: DrawingShape): shape is ImageShape {
  return shape.kind === 'image';
}

// ── Generic kind guard factory ──────────────────────────────────────

/**
 * Creates a type guard for a specific shape kind.
 *
 * @example
 * const isRect = isShapeOfKind('rectangle');
 * if (isRect(shape)) { shape.dimensions; } // narrows correctly
 */
export function isShapeOfKind<K extends ShapeKind>(
  kind: K,
): (shape: DrawingShape) => shape is Extract<DrawingShape, { kind: K }> {
  return (shape): shape is Extract<DrawingShape, { kind: K }> =>
    shape.kind === kind;
}
