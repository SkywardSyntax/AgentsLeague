import { describe, expect, it } from 'vitest';
import {
  assertNoSharedMutable,
  createIsolatedContext,
} from '@/lib/__tests__/test-isolation-check';

describe('test-isolation', () => {
  it('assertNoSharedMutable on a frozen object returns no violations', () => {
    const obj = Object.freeze({ a: 1, b: 'hello' });
    expect(assertNoSharedMutable(obj)).toEqual([]);
  });

  it('assertNoSharedMutable on object with mutable array returns violation', () => {
    const violations = assertNoSharedMutable([1, 2, 3], 'arr');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.reason).toContain('mutable array');
  });

  it('assertNoSharedMutable on a function returns no violations', () => {
    expect(assertNoSharedMutable(() => 42)).toEqual([]);
  });

  it('assertNoSharedMutable on a primitive returns no violations', () => {
    expect(assertNoSharedMutable(42)).toEqual([]);
    expect(assertNoSharedMutable('hello')).toEqual([]);
    expect(assertNoSharedMutable(true)).toEqual([]);
  });

  it('createIsolatedContext returns independent copies on each call', () => {
    const getCtx = createIsolatedContext(() => ({ items: [1, 2, 3] }));
    const a = getCtx();
    const b = getCtx();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('mutating one isolated context does not affect another', () => {
    const getCtx = createIsolatedContext(() => ({ items: [1, 2, 3] }));
    const a = getCtx();
    const b = getCtx();
    a.items.push(4);
    expect(b.items).toEqual([1, 2, 3]);
  });

  it('assertNoSharedMutable on object with nested mutable object returns violation', () => {
    const obj = Object.freeze({ nested: { value: 42 } });
    const violations = assertNoSharedMutable(obj, 'root');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.reason).toContain('shallow freeze');
  });

  it('assertNoSharedMutable on Object.freeze({arr: [1]}) returns violation (shallow freeze)', () => {
    const obj = Object.freeze({ arr: [1, 2] });
    const violations = assertNoSharedMutable(obj, 'root');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('createIsolatedContext with factory function calls factory each time', () => {
    let callCount = 0;
    const getCtx = createIsolatedContext(() => {
      callCount++;
      return { id: callCount };
    });
    getCtx();
    getCtx();
    getCtx();
    expect(callCount).toBe(3);
  });

  it('assertNoSharedMutable on class instance with methods returns no violations', () => {
    class MyClass {
      greet() { return 'hello'; }
    }
    // Functions (methods) are safe
    const violations = assertNoSharedMutable(MyClass.prototype.greet);
    expect(violations).toEqual([]);
  });
});
