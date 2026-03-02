/**
 * Math constants catalog — all geometry and math constants in one place.
 */

/** Full circle in radians (2π) */
export const TAU = 2 * Math.PI;

/** Golden ratio φ ≈ 1.618033988749895 */
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

/** √2 */
export const SQRT2 = Math.SQRT2;

/** √3 ≈ 1.7320508075688772 */
export const SQRT3 = Math.sqrt(3);

/** Conversion factor: multiply degrees by this to get radians */
export const DEG_TO_RAD = Math.PI / 180;

/** Conversion factor: multiply radians by this to get degrees */
export const RAD_TO_DEG = 180 / Math.PI;

/** Default tolerance for floating-point comparisons */
export const EPSILON = 1e-10;

/** Half π (90°) */
export const HALF_PI = Math.PI / 2;

/**
 * Returns true if two numbers are equal within EPSILON tolerance.
 */
export function nearlyEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Normalizes an angle to the range [0, TAU).
 */
export function clampAngle(radians: number): number {
  const mod = radians % TAU;
  return mod < 0 ? mod + TAU : mod;
}
