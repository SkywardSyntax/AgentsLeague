import { describe, expect, it } from 'vitest';
import { hashString, seededRandom } from '@/lib/math/seed';

describe('hashString', () => {
  it('returns the same value on repeated calls (determinism)', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('returns FNV offset basis for empty string', () => {
    expect(hashString('')).toBe(2166136261);
  });

  it('produces distinct hashes for distinct single-char inputs', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('handles Unicode and returns a valid unsigned 32-bit number', () => {
    const result = hashString('🖊️📐');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(result)).toBe(true);
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

  it('produces values in [0, 1) for 500 samples', () => {
    const gen = seededRandom(123);
    for (let i = 0; i < 500; i++) {
      const v = gen();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
