import { describe, expect, it } from 'vitest';
import {
  validatePoint,
  validatePointArray,
  validateBatchSize,
  detectDuplicatePoints,
  detectPathologicalDensity,
  clampPoint,
  sanitizePointArray,
} from '@/lib/whiteboard/coordinate-validator';

describe('coordinate-validator edge cases', () => {
  describe('validatePoint', () => {
    it('rejects null input', () => {
      const r = validatePoint(null);
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toContain('non-null object');
    });

    it('rejects undefined input', () => {
      const r = validatePoint(undefined);
      expect(r.valid).toBe(false);
    });

    it('rejects non-object input (number)', () => {
      const r = validatePoint(42);
      expect(r.valid).toBe(false);
    });

    it('rejects NaN x coordinate', () => {
      const r = validatePoint({ x: NaN, y: 5 });
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('Invalid x'))).toBe(true);
    });

    it('rejects Infinity y coordinate', () => {
      const r = validatePoint({ x: 5, y: Infinity });
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('Invalid y'))).toBe(true);
    });

    it('rejects coordinates exceeding MAX_COORDINATE_VALUE', () => {
      const r = validatePoint({ x: 2_000_000, y: -2_000_000 });
      expect(r.valid).toBe(false);
      expect(r.errors).toHaveLength(2);
    });

    it('accepts valid point at origin', () => {
      const r = validatePoint({ x: 0, y: 0 });
      expect(r.valid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });
  });

  describe('validatePointArray', () => {
    it('rejects non-array input', () => {
      const r = validatePointArray('not-array');
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toContain('must be an array');
    });

    it('rejects array exceeding MAX_POINTS_PER_STROKE', () => {
      const bigArray = Array.from({ length: 10_001 }, (_, i) => ({ x: i, y: i }));
      const r = validatePointArray(bigArray);
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toContain('Too many points');
    });

    it('truncates errors at 10+ invalid points', () => {
      const invalidPoints = Array.from({ length: 15 }, () => ({ x: NaN, y: NaN }));
      const r = validatePointArray(invalidPoints);
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeLessThanOrEqual(12);
    });
  });

  describe('validateBatchSize', () => {
    it('rejects negative stroke count', () => {
      const r = validateBatchSize(-1);
      expect(r.valid).toBe(false);
    });

    it('rejects NaN stroke count', () => {
      const r = validateBatchSize(NaN);
      expect(r.valid).toBe(false);
    });

    it('rejects stroke count over limit (500)', () => {
      const r = validateBatchSize(501);
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toContain('exceeds limit');
    });

    it('accepts valid batch size', () => {
      const r = validateBatchSize(100);
      expect(r.valid).toBe(true);
    });
  });

  describe('detectDuplicatePoints', () => {
    it('detects consecutive near-duplicate points', () => {
      const pts = [
        { x: 0, y: 0 },
        { x: 0.005, y: 0.005 },
        { x: 0.008, y: 0.008 },
        { x: 10, y: 10 },
      ];
      const r = detectDuplicatePoints(pts);
      expect(r.hasDuplicates).toBe(true);
      expect(r.duplicateCount).toBe(2);
    });

    it('returns no duplicates for well-spaced points', () => {
      const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }];
      const r = detectDuplicatePoints(pts);
      expect(r.hasDuplicates).toBe(false);
      expect(r.duplicateCount).toBe(0);
    });
  });

  describe('detectPathologicalDensity', () => {
    it('detects high density cluster', () => {
      const pts = Array.from({ length: 200 }, () => ({ x: 5.5, y: 5.5 }));
      const r = detectPathologicalDensity(pts);
      expect(r.pathological).toBe(true);
      expect(r.maxDensity).toBe(200);
    });

    it('returns not pathological for sparse points', () => {
      const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
      const r = detectPathologicalDensity(pts);
      expect(r.pathological).toBe(false);
    });

    it('returns not pathological for fewer than 2 points', () => {
      const r = detectPathologicalDensity([{ x: 0, y: 0 }]);
      expect(r.pathological).toBe(false);
      expect(r.maxDensity).toBe(0);
    });
  });

  describe('clampPoint and sanitizePointArray', () => {
    it('clamps coordinates to COORD_BOUNDS', () => {
      const p = clampPoint({ x: -9999, y: 9999 });
      expect(p.x).toBe(-2000);
      expect(p.y).toBe(4000);
    });

    it('sanitizePointArray filters out non-finite points and clamps', () => {
      const pts = [
        { x: 0, y: 0 },
        { x: NaN, y: 5 },
        { x: 100, y: Infinity },
        { x: -5000, y: 5000 },
      ];
      const result = sanitizePointArray(pts);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ x: 0, y: 0 });
      expect(result[1]!.x).toBe(-2000);
      expect(result[1]!.y).toBe(4000);
    });
  });
});
