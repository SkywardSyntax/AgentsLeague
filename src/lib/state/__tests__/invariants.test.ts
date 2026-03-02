import { describe, it, expect } from 'vitest';
import {
  assertInvariant,
  InvariantViolation,
  checkStateTransition,
  defineInvariant,
  composeInvariants,
  checkStateTransitionAsync,
} from '../invariants';

describe('Lane 06 — State Invariant Checks', () => {
  it('assertInvariant() does nothing when condition is true', () => {
    expect(() => assertInvariant(true, 'test')).not.toThrow();
  });

  it('assertInvariant() throws InvariantViolation when condition is false', () => {
    expect(() => assertInvariant(false, 'count-positive')).toThrow(InvariantViolation);
  });

  it('InvariantViolation extends Error with invariantName', () => {
    const v = new InvariantViolation('myInv', 'broke', 'prev', 'next');
    expect(v).toBeInstanceOf(Error);
    expect(v.invariantName).toBe('myInv');
  });

  it('checkStateTransition() returns valid for legal transition', () => {
    const inv = defineInvariant<number>('positive', (_p, n) => n > 0);
    const result = checkStateTransition(1, 2, [inv]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('checkStateTransition() returns violation for illegal transition', () => {
    const inv = defineInvariant<number>('positive', (_p, n) => n > 0, 'must be positive');
    const result = checkStateTransition(1, -1, [inv]);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('must be positive');
  });

  it('defineInvariant() creates named invariant checker', () => {
    const checker = defineInvariant<string>('non-empty', (_p, n) => n.length > 0);
    expect(checker('a', 'b')).toBeNull();
    expect(checker('a', '')).toBeTruthy();
  });

  it('composeInvariants() combines multiple invariants', () => {
    const positive = defineInvariant<number>('positive', (_p, n) => n > 0);
    const notHuge = defineInvariant<number>('not-huge', (_p, n) => n < 1000);
    const composed = composeInvariants(positive, notHuge);
    expect(composed(0, 5)).toBeNull();
    expect(composed(0, -1)).toBeTruthy();
  });

  it('InvariantViolation includes previous and next state info', () => {
    const v = new InvariantViolation('test', 'broke', { a: 1 }, { a: 2 });
    expect(v.previousState).toEqual({ a: 1 });
    expect(v.nextState).toEqual({ a: 2 });
  });

  it('assertInvariant() includes custom message in error', () => {
    try {
      assertInvariant(false, 'myCheck', 'count was negative');
    } catch (e) {
      expect((e as Error).message).toContain('count was negative');
      return;
    }
    expect.fail('should have thrown');
  });

  it('checkStateTransitionAsync() supports async validators', async () => {
    const asyncCheck = async (_prev: number, next: number) =>
      next > 0 ? null : 'must be positive';
    const result = await checkStateTransitionAsync(1, -1, [asyncCheck]);
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('must be positive');
  });
});
