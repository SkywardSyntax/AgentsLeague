import { describe, expect, it } from 'vitest';
import { hashString, seededRandom } from '@/lib/math/seed';

describe('hashString', () => {
  it('returns consistent output for the same input', () => {
    const a = hashString('hello');
    const b = hashString('hello');
    expect(a).toBe(b);
  });

  it('returns FNV offset basis 2166136261 for empty string', () => {
    expect(hashString('')).toBe(2166136261);
  });

  it('produces distinct hashes for different inputs', () => {
    expect(hashString('abc')).not.toBe(hashString('xyz'));
  });

  it('handles multi-byte Unicode without throwing', () => {
    expect(() => hashString('日本語')).not.toThrow();
    expect(() => hashString('🎨')).not.toThrow();
    expect(typeof hashString('日本語')).toBe('number');
    expect(typeof hashString('🎨')).toBe('number');
  });
});

describe('seededRandom', () => {
  it('produces identical sequences on repeated calls with same seed', () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('output values are all in [0, 1) over 1000 samples', () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
