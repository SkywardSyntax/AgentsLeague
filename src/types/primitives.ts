/**
 * Branded types and primitive value types for the AI Whiteboard.
 *
 * Branded types carry a compile-time tag so values of the same
 * underlying JS type (e.g. number) cannot be accidentally swapped.
 */

// ── Branded-type utility ────────────────────────────────────────────
declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Atomic value types ──────────────────────────────────────────────

/** 0-255 integer channel value */
export type ChannelValue = Brand<number, 'ChannelValue'>;

/** 0-1 inclusive float */
export type UnitFloat = Brand<number, 'UnitFloat'>;

/** Positive (non-zero) pixel measurement */
export type PositivePx = Brand<number, 'PositivePx'>;

/** Finite numeric coordinate */
export type Coordinate = Brand<number, 'Coordinate'>;

// ── Color types ─────────────────────────────────────────────────────

export interface RGBAColor {
  readonly r: ChannelValue;
  readonly g: ChannelValue;
  readonly b: ChannelValue;
  readonly a: UnitFloat;
}

/** 6-digit hex color string, e.g. "#ff00aa" */
export type HexColor = Brand<string, 'HexColor'>;

export type Color = RGBAColor | HexColor;

// ── Geometry ────────────────────────────────────────────────────────

export interface Position {
  readonly x: Coordinate;
  readonly y: Coordinate;
}

export interface Dimensions {
  readonly width: PositivePx;
  readonly height: PositivePx;
}

export interface BoundingBox extends Position, Dimensions {}

// ── Font ────────────────────────────────────────────────────────────

export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type FontStyle = 'normal' | 'italic' | 'oblique';

export interface Font {
  readonly family: string;
  readonly size: PositivePx;
  readonly weight: FontWeight;
  readonly style: FontStyle;
  readonly lineHeight: UnitFloat | PositivePx;
}

// ── Shape ID ────────────────────────────────────────────────────────

export type ShapeId = Brand<string, 'ShapeId'>;

// ── Branded constructors (throw on invalid input) ───────────────────

export function channelValue(n: number): ChannelValue {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new TypeError(`Expected integer 0-255, got ${n}`);
  }
  return n as ChannelValue;
}

export function unitFloat(n: number): UnitFloat {
  if (typeof n !== 'number' || n < 0 || n > 1) {
    throw new TypeError(`Expected float 0-1, got ${n}`);
  }
  return n as UnitFloat;
}

export function positivePx(n: number): PositivePx {
  if (typeof n !== 'number' || n <= 0 || !Number.isFinite(n)) {
    throw new TypeError(`Expected positive finite number, got ${n}`);
  }
  return n as PositivePx;
}

export function coordinate(n: number): Coordinate {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new TypeError(`Expected finite number, got ${n}`);
  }
  return n as Coordinate;
}

export function hexColor(s: string): HexColor {
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new TypeError(`Expected hex color (#rrggbb), got "${s}"`);
  }
  return s as HexColor;
}

export function shapeId(s: string): ShapeId {
  if (typeof s !== 'string' || s.length === 0) {
    throw new TypeError(`Expected non-empty string, got "${s}"`);
  }
  return s as ShapeId;
}
