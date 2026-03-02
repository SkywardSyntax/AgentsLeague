import { describe, it, expect } from 'vitest';
import {
  safeAdd,
  safeMul,
  safeDist,
  safeTransformPoint,
  safeBoundingBox,
  overflowReport,
} from '../whiteboard/geometry-overflow';
import { COORD_BOUNDS } from '../whiteboard/clamp-coordinates';
import type { DrawElement } from '@/types/agent';

describe('geometry-overflow', () => {
  // Test 1
  it('safeAdd(100, 200) returns { value: 300, overflowed: false }', () => {
    const result = safeAdd(100, 200);
    expect(result).toEqual({ value: 300, overflowed: false });
  });

  // Test 2
  it('safeAdd(3500, 1000) clamps to COORD_BOUNDS.MAX_X and returns overflowed: true', () => {
    const result = safeAdd(3500, 1000);
    expect(result.value).toBe(COORD_BOUNDS.MAX_X);
    expect(result.overflowed).toBe(true);
  });

  // Test 3
  it('safeAdd(-2500, -100) clamps to COORD_BOUNDS.MIN_X and returns overflowed: true', () => {
    const result = safeAdd(-2500, -100);
    expect(result.value).toBe(COORD_BOUNDS.MIN_X);
    expect(result.overflowed).toBe(true);
  });

  // Test 4
  it('safeMul(100, 50) returns { value: 4000, overflowed: true } (clamped to MAX)', () => {
    const result = safeMul(100, 50);
    expect(result.value).toBe(COORD_BOUNDS.MAX_X);
    expect(result.overflowed).toBe(true);
  });

  // Test 5
  it('safeDist between (0,0) and (3000,4000) returns clamped distance with overflowed: true', () => {
    const result = safeDist({ x: 0, y: 0 }, { x: 3000, y: 4000 });
    // Math.hypot(3000, 4000) = 5000, exceeds MAX_X
    expect(result.value).toBe(COORD_BOUNDS.MAX_X);
    expect(result.overflowed).toBe(true);
  });

  // Test 6
  it('safeTransformPoint with identity matrix returns original point, overflowed: false', () => {
    const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    const result = safeTransformPoint({ x: 100, y: 200 }, identity);
    expect(result.value).toEqual({ x: 100, y: 200 });
    expect(result.overflowed).toBe(false);
  });

  // Test 7
  it('safeTransformPoint with extreme scale matrix clamps output and sets overflowed: true', () => {
    const extreme = { a: 100, b: 0, c: 0, d: 100, tx: 0, ty: 0 };
    const result = safeTransformPoint({ x: 100, y: 100 }, extreme);
    expect(result.value.x).toBe(COORD_BOUNDS.MAX_X);
    expect(result.value.y).toBe(COORD_BOUNDS.MAX_Y);
    expect(result.overflowed).toBe(true);
  });

  // Test 8
  it('safeBoundingBox on 3 rects returns correct bounding box with overflowed: false', () => {
    const rects: DrawElement[] = [
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
      { id: 'r2', type: 'rect', x: 200, y: 30, w: 80, h: 60 },
      { id: 'r3', type: 'rect', x: 50, y: 100, w: 120, h: 40 },
    ];
    const result = safeBoundingBox(rects);
    expect(result.value).toEqual({ minX: 10, minY: 20, maxX: 280, maxY: 140 });
    expect(result.overflowed).toBe(false);
  });

  // Test 9
  it('safeBoundingBox on elements with Infinity coordinate returns clamped box with overflowed: true', () => {
    const elements: DrawElement[] = [
      { id: 'r1', type: 'rect', x: Infinity, y: 10, w: 100, h: 50 },
    ];
    const result = safeBoundingBox(elements);
    expect(result.overflowed).toBe(true);
    expect(Number.isFinite(result.value.minX)).toBe(true);
    expect(Number.isFinite(result.value.maxX)).toBe(true);
  });

  // Test 10
  it('overflowReport on mix of overflowed/normal results returns correct counts and rate', () => {
    const results = [
      { value: 300, overflowed: false },
      { value: 4000, overflowed: true },
      { value: 200, overflowed: false },
      { value: 4000, overflowed: true },
      { value: 100, overflowed: false },
    ];
    const report = overflowReport(results);
    expect(report.count).toBe(5);
    expect(report.overflowCount).toBe(2);
    expect(report.overflowRate).toBeCloseTo(0.4);
  });

  // Test 11
  it('safeAdd(NaN, 100) returns { value: COORD_BOUNDS.MIN_X, overflowed: true }', () => {
    const result = safeAdd(NaN, 100);
    expect(result.value).toBe(COORD_BOUNDS.MIN_X);
    expect(result.overflowed).toBe(true);
  });
});
