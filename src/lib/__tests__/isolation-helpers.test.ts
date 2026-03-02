import { describe, it, expect } from 'vitest';
import {
  createIsolatedStore,
  uniqueTestId,
  withIsolatedGlobal,
  createIsolatedMap,
} from '@/test/isolation-helpers';

describe('isolation helpers', () => {
  it('createIsolatedStore returns unique instance per call', () => {
    const s1 = createIsolatedStore();
    const s2 = createIsolatedStore();
    s1.set('key', 'a');
    expect(s2.has('key')).toBe(false);
  });

  it('two stores do not share keys', () => {
    const s1 = createIsolatedStore();
    const s2 = createIsolatedStore();
    s1.set('x', 1);
    s2.set('x', 2);
    expect(s1.get('x')).toBe(1);
    expect(s2.get('x')).toBe(2);
  });

  it('writes to one store do not appear in another', () => {
    const s1 = createIsolatedStore();
    const s2 = createIsolatedStore();
    s1.set('a', 'val');
    s1.set('b', 'val');
    expect(s2.size()).toBe(0);
  });

  it('withIsolatedGlobal restores original after callback', () => {
    const target: Record<string, unknown> = { foo: 'original' };
    withIsolatedGlobal(target, 'foo', 'temp', () => {
      expect(target.foo).toBe('temp');
    });
    expect(target.foo).toBe('original');
  });

  it('unique test IDs never collide across 1000 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(uniqueTestId());
    }
    expect(ids.size).toBe(1000);
  });

  it('isolated stores with delete and clear', () => {
    const store = createIsolatedStore();
    store.set('a', 1);
    store.set('b', 2);
    store.delete('a');
    expect(store.has('a')).toBe(false);
    expect(store.size()).toBe(1);
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('scoped Map instances are independent', () => {
    const m1 = createIsolatedMap<string, number>();
    const m2 = createIsolatedMap<string, number>();
    m1.set('key', 42);
    expect(m2.has('key')).toBe(false);
    expect(m1.get('key')).toBe(42);
  });

  it('cleanup function removes all scoped data', () => {
    const store = createIsolatedStore();
    store.set('a', 1);
    store.set('b', 2);
    store.set('c', 3);
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.has('a')).toBe(false);
  });

  it('nested isolation scopes work correctly', () => {
    const target: Record<string, unknown> = { val: 'root' };
    withIsolatedGlobal(target, 'val', 'level1', () => {
      expect(target.val).toBe('level1');
      withIsolatedGlobal(target, 'val', 'level2', () => {
        expect(target.val).toBe('level2');
      });
      expect(target.val).toBe('level1');
    });
    expect(target.val).toBe('root');
  });

  it('error in callback still triggers cleanup', () => {
    const target: Record<string, unknown> = { val: 'original' };
    expect(() => {
      withIsolatedGlobal(target, 'val', 'temp', () => {
        throw new Error('boom');
      });
    }).toThrow('boom');
    expect(target.val).toBe('original');
  });
});
