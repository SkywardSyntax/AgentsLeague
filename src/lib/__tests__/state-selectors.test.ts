import { describe, expect, it, vi } from 'vitest';
import { createSelector } from '@/lib/state/selectors';

interface TestState {
  count: number;
  items: string[];
  label?: string;
}

describe('state-selectors', () => {
  it('createSelector returns a function', () => {
    const selector = createSelector(
      [(s: TestState) => s.count],
      (count) => count * 2,
    );
    expect(typeof selector).toBe('function');
  });

  it('returns correct derived value on first call', () => {
    const selector = createSelector(
      [(s: TestState) => s.count],
      (count) => count * 3,
    );
    expect(selector({ count: 5, items: [] })).toBe(15);
  });

  it('calling twice with same state reference returns same object reference', () => {
    const selector = createSelector(
      [(s: TestState) => s.items],
      (items) => items.map((i) => i.toUpperCase()),
    );
    const state: TestState = { count: 0, items: ['a', 'b'] };
    const first = selector(state);
    const second = selector(state);
    expect(first).toBe(second); // same reference
  });

  it('calling with new state (different reference) recomputes', () => {
    const selector = createSelector(
      [(s: TestState) => s.items],
      (items) => items.map((i) => i.toUpperCase()),
    );
    const state1: TestState = { count: 0, items: ['a'] };
    const state2: TestState = { count: 0, items: ['b'] };
    const first = selector(state1);
    const second = selector(state2);
    expect(first).not.toBe(second);
  });

  it('combiner executes exactly once for two calls with same state', () => {
    const combiner = vi.fn((count: number) => count * 2);
    const selector = createSelector(
      [(s: TestState) => s.count],
      combiner,
    );
    const state: TestState = { count: 7, items: [] };
    selector(state);
    selector(state);
    expect(combiner).toHaveBeenCalledTimes(1);
  });

  it('combiner executes twice for two calls with different states', () => {
    const combiner = vi.fn((count: number) => count * 2);
    const selector = createSelector(
      [(s: TestState) => s.count],
      combiner,
    );
    selector({ count: 1, items: [] });
    selector({ count: 2, items: [] });
    expect(combiner).toHaveBeenCalledTimes(2);
  });

  it('selector with multiple input selectors combines all inputs', () => {
    const selector = createSelector(
      [
        (s: TestState) => s.count,
        (s: TestState) => s.items,
      ],
      (count, items) => `${count}:${items.join(',')}`,
    );
    expect(selector({ count: 3, items: ['x', 'y'] })).toBe('3:x,y');
  });

  it('resetSelector clears memoized value, forces recompute', () => {
    const combiner = vi.fn((count: number) => count * 2);
    const selector = createSelector(
      [(s: TestState) => s.count],
      combiner,
    );
    const state: TestState = { count: 5, items: [] };
    selector(state);
    selector.resetSelector();
    selector(state);
    expect(combiner).toHaveBeenCalledTimes(2);
  });

  it('handles undefined state without crashing', () => {
    const selector = createSelector(
      [(s: TestState | undefined) => s?.count ?? 0],
      (count) => count * 2,
    );
    expect(selector(undefined as unknown as TestState)).toBe(0);
  });

  it('nested selectors memoize correctly', () => {
    const inner = createSelector(
      [(s: TestState) => s.count],
      (count) => count * 2,
    );
    const outerCombiner = vi.fn((doubled: number) => doubled + 1);
    const outer = createSelector(
      [(s: TestState) => inner(s)],
      outerCombiner,
    );
    const state: TestState = { count: 3, items: [] };
    const first = outer(state);
    const second = outer(state);
    expect(first).toBe(7);
    expect(second).toBe(7);
    expect(outerCombiner).toHaveBeenCalledTimes(1);
  });
});
