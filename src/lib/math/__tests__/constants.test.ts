import { describe, it, expect } from 'vitest';
import {
  TAU,
  GOLDEN_RATIO,
  DEG_TO_RAD,
  RAD_TO_DEG,
  EPSILON,
  nearlyEqual,
  SQRT2,
  SQRT3,
  clampAngle,
} from '../constants';

describe('Lane 09 — Math Constants Catalog', () => {
  it('TAU equals 2 * Math.PI', () => {
    expect(TAU).toBe(2 * Math.PI);
  });

  it('GOLDEN_RATIO is approximately 1.618', () => {
    expect(GOLDEN_RATIO).toBeCloseTo(1.618, 3);
  });

  it('DEG_TO_RAD converts 180 to PI', () => {
    expect(180 * DEG_TO_RAD).toBeCloseTo(Math.PI, 10);
  });

  it('RAD_TO_DEG converts PI to 180', () => {
    expect(Math.PI * RAD_TO_DEG).toBeCloseTo(180, 10);
  });

  it('EPSILON is a small positive number', () => {
    expect(EPSILON).toBeGreaterThan(0);
    expect(EPSILON).toBeLessThan(1e-6);
  });

  it('nearlyEqual() returns true for values within EPSILON', () => {
    expect(nearlyEqual(1.0, 1.0 + 1e-12)).toBe(true);
  });

  it('nearlyEqual() returns false for values outside EPSILON', () => {
    expect(nearlyEqual(1.0, 2.0)).toBe(false);
  });

  it('SQRT2 equals Math.SQRT2', () => {
    expect(SQRT2).toBe(Math.SQRT2);
  });

  it('SQRT3 is approximately 1.732', () => {
    expect(SQRT3).toBeCloseTo(1.732, 3);
  });

  it('clampAngle() normalizes to [0, TAU) range', () => {
    expect(clampAngle(0)).toBeCloseTo(0, 10);
    expect(clampAngle(TAU)).toBeCloseTo(0, 10);
    expect(clampAngle(-Math.PI)).toBeCloseTo(Math.PI, 10);
    const result = clampAngle(TAU + 1);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(TAU);
  });
});
