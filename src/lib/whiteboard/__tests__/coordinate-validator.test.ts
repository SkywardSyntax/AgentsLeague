import { describe, it, expect } from 'vitest';
import {
  validatePoint,
  validatePointArray,
  validateBatchSize,
  detectDuplicatePoints,
  detectPathologicalDensity,
  clampPoint,
  sanitizePointArray,
} from '../coordinate-validator';

describe('coordinate-validator', () => {
  describe('validatePoint', () => {
    it('accepts valid points', () => {
      expect(validatePoint({ x: 100, y: 200 }).valid).toBe(true);
      expect(validatePoint({ x: 0, y: 0 }).valid).toBe(true);
      expect(validatePoint({ x: -500, y: 3000 }).valid).toBe(true);
    });

    it('rejects NaN coordinates', () => {
      expect(validatePoint({ x: NaN, y: 100 }).valid).toBe(false);
    });

    it('rejects Infinity coordinates', () => {
      expect(validatePoint({ x: Infinity, y: 100 }).valid).toBe(false);
    });

    it('rejects null/undefined points', () => {
      expect(validatePoint(null).valid).toBe(false);
      expect(validatePoint(undefined).valid).toBe(false);
    });

    it('rejects extremely large coordinates', () => {
      expect(validatePoint({ x: 2_000_000, y: 0 }).valid).toBe(false);
    });

    it('rejects non-object values', () => {
      expect(validatePoint('string').valid).toBe(false);
    });
  });

  describe('validatePointArray', () => {
    it('accepts valid point arrays', () => {
      const result = validatePointArray([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
      expect(result.valid).toBe(true);
    });

    it('rejects non-arrays', () => {
      expect(validatePointArray('not an array').valid).toBe(false);
    });

    it('rejects oversized arrays', () => {
      const hugeArray = Array.from({ length: 15_000 }, (_, i) => ({ x: i, y: i }));
      const result = validatePointArray(hugeArray);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Too many points');
    });

    it('reports invalid points within array', () => {
      const result = validatePointArray([{ x: 0, y: 0 }, { x: NaN, y: 100 }]);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateBatchSize', () => {
    it('accepts valid batch sizes', () => {
      expect(validateBatchSize(10).valid).toBe(true);
      expect(validateBatchSize(500).valid).toBe(true);
    });

    it('rejects oversized batches', () => {
      expect(validateBatchSize(1000).valid).toBe(false);
    });

    it('rejects negative values', () => {
      expect(validateBatchSize(-1).valid).toBe(false);
    });
  });

  describe('detectDuplicatePoints', () => {
    it('detects consecutive duplicate points', () => {
      const result = detectDuplicatePoints([
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 10 },
      ]);
      expect(result.hasDuplicates).toBe(true);
      expect(result.duplicateCount).toBe(2);
    });

    it('returns no duplicates for spread-out points', () => {
      const result = detectDuplicatePoints([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 200, y: 200 },
      ]);
      expect(result.hasDuplicates).toBe(false);
    });
  });

  describe('detectPathologicalDensity', () => {
    it('detects extreme density', () => {
      const points = Array.from({ length: 200 }, () => ({ x: 5.5, y: 5.5 }));
      const result = detectPathologicalDensity(points);
      expect(result.pathological).toBe(true);
      expect(result.maxDensity).toBe(200);
    });

    it('passes normal density', () => {
      const points = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: i * 10 }));
      const result = detectPathologicalDensity(points);
      expect(result.pathological).toBe(false);
    });
  });

  describe('clampPoint', () => {
    it('clamps to bounds', () => {
      const result = clampPoint({ x: -15000, y: 15000 });
      expect(result.x).toBe(-10000);
      expect(result.y).toBe(10000);
    });

    it('does not modify in-bounds points', () => {
      const result = clampPoint({ x: 100, y: 200 });
      expect(result).toEqual({ x: 100, y: 200 });
    });
  });

  describe('sanitizePointArray', () => {
    it('filters out invalid points', () => {
      const result = sanitizePointArray([
        { x: 100, y: 200 },
        { x: NaN, y: 300 },
        { x: 400, y: Infinity },
        { x: 500, y: 600 },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ x: 100, y: 200 });
    });

    it('clamps points to bounds', () => {
      const result = sanitizePointArray([{ x: 50000, y: -50000 }]);
      expect(result[0]!.x).toBe(10000);
      expect(result[0]!.y).toBe(-10000);
    });
  });
});
