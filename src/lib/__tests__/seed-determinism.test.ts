import { describe, it, expect } from 'vitest';
import { hashString, seededRandom } from '../math/seed';

describe('hashString', () => {
  it('returns unsigned 32-bit integer (≥ 0) for varied strings', () => {
    const inputs = [
      'hello', 'world', '', 'a', '🎉', 'abc123',
      'test string with spaces', 'UPPERCASE', 'camelCase',
      'dash-case', 'under_score', '12345', 'special!@#$%',
      'very long string '.repeat(20), '\n\t\r', 'null',
      'undefined', 'true', 'false', '0',
    ];
    for (const input of inputs) {
      const result = hashString(input);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it("returns FNV-1a offset basis for empty string", () => {
    expect(hashString('')).toBe(2166136261);
  });

  it('is deterministic', () => {
    expect(hashString('test')).toBe(hashString('test'));
    expect(hashString('another')).toBe(hashString('another'));
  });

  it('produces different values for similar strings', () => {
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('foo')).not.toBe(hashString('fop'));
    expect(hashString('bar')).not.toBe(hashString('baz'));
  });

  it('has collision resistance across 100 distinct strings', () => {
    const hashes = new Set<number>();
    for (let i = 0; i < 100; i++) {
      hashes.add(hashString(`item-${i}`));
    }
    expect(hashes.size).toBe(100);
  });
});

describe('seededRandom', () => {
  it('produces values in [0, 1)', () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('is deterministic for same seed', () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = seededRandom(1);
    const rng2 = seededRandom(2);
    let allSame = true;
    for (let i = 0; i < 10; i++) {
      if (rng1() !== rng2()) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it('works with seed 0 (does not infinite loop)', () => {
    const rng = seededRandom(0);
    const values: number[] = [];
    for (let i = 0; i < 10; i++) {
      values.push(rng());
    }
    expect(values.length).toBe(10);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    // Should not all be identical
    const unique = new Set(values);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('produces uniform-ish distribution across 10 bins', () => {
    const rng = seededRandom(12345);
    const bins = new Array(10).fill(0);
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const bin = Math.min(Math.floor(rng() * 10), 9);
      bins[bin]++;
    }
    for (let i = 0; i < 10; i++) {
      expect(bins[i]).toBeGreaterThanOrEqual(800);
      expect(bins[i]).toBeLessThanOrEqual(1200);
    }
  });
});
