import { describe, expect, it } from 'vitest';
import { computeTexCacheKey } from '@/lib/latex/cache-key';

describe('latex-cache-key', () => {
  it('returns identical key for "x^2" and " x^2 " (whitespace trim)', () => {
    expect(computeTexCacheKey('x^2')).toBe(computeTexCacheKey(' x^2 '));
  });

  it('returns identical key for "\\frac{a}{b}" and "\\frac {a} {b}"', () => {
    expect(computeTexCacheKey('\\frac{a}{b}')).toBe(
      computeTexCacheKey('\\frac {a} {b}'),
    );
  });

  it('returns identical key for "{x}" and "x" (redundant braces)', () => {
    expect(computeTexCacheKey('{x}')).toBe(computeTexCacheKey('x'));
  });

  it('returns different keys for "x^2" and "x^3"', () => {
    expect(computeTexCacheKey('x^2')).not.toBe(computeTexCacheKey('x^3'));
  });

  it('returns different keys when displayMode differs', () => {
    expect(computeTexCacheKey('x^2', true)).not.toBe(
      computeTexCacheKey('x^2', false),
    );
  });

  it('returns a string (not undefined or empty)', () => {
    const key = computeTexCacheKey('\\alpha + \\beta');
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('is deterministic — same input always produces same key', () => {
    const a = computeTexCacheKey('\\sum_{i=0}^{n} x_i');
    const b = computeTexCacheKey('\\sum_{i=0}^{n} x_i');
    expect(a).toBe(b);
  });

  it('key for empty string is stable and non-empty', () => {
    const key = computeTexCacheKey('');
    expect(key.length).toBeGreaterThan(0);
    expect(computeTexCacheKey('')).toBe(key);
  });

  it('key length is bounded (≤64 chars for any input)', () => {
    const longTex = '\\frac{' + 'a'.repeat(200) + '}{' + 'b'.repeat(200) + '}';
    const key = computeTexCacheKey(longTex);
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it('nested fractions normalize to same key regardless of spacing', () => {
    const a = computeTexCacheKey('\\frac{\\frac{a}{b}}{c}');
    const b = computeTexCacheKey('\\frac{ \\frac {a} {b} }{ c }');
    expect(a).toBe(b);
  });
});
