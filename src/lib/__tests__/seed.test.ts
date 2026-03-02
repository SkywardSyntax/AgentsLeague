import { describe, expect, it } from 'vitest';
import { hashString, seededRandom } from '@/lib/math/seed';

describe('hashString', () => {
  it('returns the same value on repeated calls (determinism)', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('returns consistent output for the same input', () => {
    const a = hashString('hello');
    const b = hashString('hello');
    expect(a).toBe(b);
  });

  it('returns FNV offset basis for empty string', () => {
    expect(hashString('')).toBe(2166136261);
  });

  it('produces distinct hashes for distinct single-char inputs', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('produces distinct hashes for different strings', () => {
    expect(hashString('abc')).not.toBe(hashString('xyz'));
  });

  it('handles Unicode and returns a valid unsigned 32-bit number', () => {
    const result = hashString('🖊️📐');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('handles emoji without throwing', () => {
    const result = hashString('🎨✏️');
    expect(typeof result).toBe('number');
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('seededRandom', () => {
  it('produces identical sequences from the same seed', () => {
    const gen1 = seededRandom(7);
    const gen2 = seededRandom(7);
    for (let i = 0; i < 20; i++) {
      expect(gen1()).toBe(gen2());
    }
  });

  it('produces identical sequences for the same seed (array comparison)', () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('produces values in [0, 1) over 1000 samples', () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
