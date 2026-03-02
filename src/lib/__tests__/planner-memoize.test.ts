import { describe, expect, it, vi } from 'vitest';
import { createMemoizedFn } from '@/lib/whiteboard/planner/memoize';

describe('planner-memoize', () => {
  it('createMemoizedFn returns a callable function', () => {
    const fn = createMemoizedFn((x: number) => x * 2);
    expect(typeof fn).toBe('function');
  });

  it('returns same result as original for identical inputs', () => {
    const original = (a: number, b: number) => a + b;
    const memoized = createMemoizedFn(original);
    expect(memoized(3, 4)).toBe(7);
  });

  it('called twice with same args executes underlying fn only once', () => {
    const spy = vi.fn((x: number) => x * 2);
    const memoized = createMemoizedFn(spy);
    memoized(5);
    memoized(5);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('called with different args executes underlying fn each time', () => {
    const spy = vi.fn((x: number) => x * 2);
    const memoized = createMemoizedFn(spy);
    memoized(1);
    memoized(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('respects maxSize — evicts oldest entry when full', () => {
    const spy = vi.fn((x: number) => x * 10);
    const memoized = createMemoizedFn(spy, 2);
    memoized(1); // cache: [1]
    memoized(2); // cache: [1, 2]
    memoized(3); // cache: [2, 3] — evicts 1
    spy.mockClear();
    memoized(1); // should re-execute (evicted)
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('after eviction, re-calling with evicted args re-executes', () => {
    const spy = vi.fn((x: number) => x);
    const memoized = createMemoizedFn(spy, 1);
    memoized(1);
    memoized(2); // evicts 1
    spy.mockClear();
    const result = memoized(1);
    expect(result).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cacheStats reports correct hits and misses', () => {
    const memoized = createMemoizedFn((x: number) => x);
    memoized(1); // miss
    memoized(1); // hit
    memoized(2); // miss
    const stats = memoized.cacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
  });

  it('clearCache resets all entries and stats', () => {
    const memoized = createMemoizedFn((x: number) => x);
    memoized(1);
    memoized(1);
    memoized.clearCache();
    const stats = memoized.cacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.size).toBe(0);
  });

  it('with object args uses deep equality for cache key', () => {
    const spy = vi.fn((obj: { a: number }) => obj.a * 2);
    const memoized = createMemoizedFn(spy);
    memoized({ a: 1 });
    memoized({ a: 1 }); // same shape, different reference
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('with undefined/null args does not crash', () => {
    const memoized = createMemoizedFn((...args: unknown[]) => args.length);
    expect(() => memoized(undefined, null)).not.toThrow();
    expect(memoized(undefined, null)).toBe(2);
  });
});
