import { describe, expect, it } from 'vitest';
import { hashString, seededRandom } from '@/lib/math/seed';

describe('hashString', () => {
  it('returns deterministic output for the same string', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('returns FNV-1a offset basis for empty string (loop skipped)', () => {
    const result = hashString('');
    expect(result).toBe(2166136261 >>> 0);
  });

  it('produces different hashes for distinct strings', () => {
    expect(hashString('abc')).not.toBe(hashString('xyz'));
  });

  it('handles unicode input without crashing', () => {
    const result = hashString('日本語');
    expect(typeof result).toBe('number');
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe('seededRandom', () => {
  it('falls back to state=1 when seed is 0', () => {
    const rng = seededRandom(0);
    const val = rng();
    expect(typeof val).toBe('number');
    expect(Number.isFinite(val)).toBe(true);
  });

  it('produces identical sequences from the same seed', () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('output is always in [0, 1] (inclusive upper bound via state / 0xffffffff)', () => {
    const rng = seededRandom(7);
    const values = Array.from({ length: 200 }, () => rng());
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('handles negative seed without crashing via >>> 0 unsigned conversion', () => {
    const rng = seededRandom(-999);
    const val = rng();
    expect(typeof val).toBe('number');
    expect(Number.isFinite(val)).toBe(true);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = seededRandom(1);
    const rng2 = seededRandom(2);
    const seq1 = Array.from({ length: 5 }, () => rng1());
    const seq2 = Array.from({ length: 5 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });
});
