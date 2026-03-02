import { describe, it, expect } from 'vitest';
import { isValidAdaptor, isValidHtml } from '@/lib/server/mathjax';

describe('MathJax type guards', () => {
  describe('isValidAdaptor', () => {
    it('returns true for a valid adaptor with outerHTML function', () => {
      const adaptor = { outerHTML: () => '<svg></svg>' };
      expect(isValidAdaptor(adaptor)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isValidAdaptor(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isValidAdaptor(undefined)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isValidAdaptor({})).toBe(false);
    });

    it('returns false when outerHTML is not a function', () => {
      expect(isValidAdaptor({ outerHTML: 'not-a-function' })).toBe(false);
    });

    it('returns false for a primitive', () => {
      expect(isValidAdaptor(42)).toBe(false);
      expect(isValidAdaptor('string')).toBe(false);
    });
  });

  describe('isValidHtml', () => {
    it('returns true for a valid html with convert function', () => {
      const html = { convert: () => ({}) };
      expect(isValidHtml(html)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isValidHtml(null)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isValidHtml({})).toBe(false);
    });

    it('returns false when convert is not a function', () => {
      expect(isValidHtml({ convert: 'not-a-function' })).toBe(false);
    });
  });
});
