import { describe, it, expect, vi } from 'vitest';
import { createOrderedDispatcher } from '@/lib/state/ordered-dispatch';

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

describe('ordered dispatch', () => {
  it('single dispatch applies correctly', async () => {
    const d = createOrderedDispatcher<number, number>((s, a) => s + a, 0);
    const state = await d.dispatch(5);
    expect(state).toBe(5);
    expect(d.getState()).toBe(5);
  });

  it('two rapid dispatches apply in order', async () => {
    const log: number[] = [];
    const d = createOrderedDispatcher<number, number>((s, a) => {
      log.push(a);
      return s + a;
    }, 0);
    const p1 = d.dispatch(1);
    const p2 = d.dispatch(2);
    await Promise.all([p1, p2]);
    expect(log).toEqual([1, 2]);
    expect(d.getState()).toBe(3);
  });

  it('async action waits for previous', async () => {
    const order: string[] = [];
    const d = createOrderedDispatcher<number, string>(async (s, a) => {
      order.push(`start-${a}`);
      await delay(a === 'slow' ? 30 : 5);
      order.push(`end-${a}`);
      return s + 1;
    }, 0);
    const p1 = d.dispatch('slow');
    const p2 = d.dispatch('fast');
    await Promise.all([p1, p2]);
    expect(order).toEqual(['start-slow', 'end-slow', 'start-fast', 'end-fast']);
  });

  it('error in action does not block subsequent', async () => {
    const d = createOrderedDispatcher<number, string>((s, a) => {
      if (a === 'fail') throw new Error('bad');
      return s + 1;
    }, 0);
    await expect(d.dispatch('fail')).rejects.toThrow('bad');
    const state = await d.dispatch('ok');
    expect(state).toBe(1);
  });

  it('state is consistent after batch', async () => {
    const d = createOrderedDispatcher<number, number>((s, a) => s + a, 0);
    await Promise.all([d.dispatch(10), d.dispatch(20), d.dispatch(30)]);
    expect(d.getState()).toBe(60);
  });

  it('getState reflects latest applied action', async () => {
    const d = createOrderedDispatcher<string[], string>((s, a) => [...s, a], []);
    await d.dispatch('a');
    expect(d.getState()).toEqual(['a']);
    await d.dispatch('b');
    expect(d.getState()).toEqual(['a', 'b']);
  });

  it('10 rapid dispatches all apply in correct order', async () => {
    const d = createOrderedDispatcher<number[], number>((s, a) => [...s, a], []);
    const promises = Array.from({ length: 10 }, (_, i) => d.dispatch(i));
    await Promise.all(promises);
    expect(d.getState()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('dispatch during dispatch is queued (not reentrant)', async () => {
    const d = createOrderedDispatcher<number, number>((s, a) => s + a, 0);
    const order: number[] = [];
    const p1 = d.dispatch(1).then((s) => { order.push(s); return s; });
    const p2 = d.dispatch(2).then((s) => { order.push(s); return s; });
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 3]);
  });

  it('listener is notified after each action', async () => {
    const d = createOrderedDispatcher<number, number>((s, a) => s + a, 0);
    const listener = vi.fn();
    d.subscribe(listener);
    await d.dispatch(5);
    await d.dispatch(10);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 5);
    expect(listener).toHaveBeenNthCalledWith(2, 15);
  });

  it('queue drains completely before idle', async () => {
    const d = createOrderedDispatcher<number, number>(async (s, a) => {
      await delay(5);
      return s + a;
    }, 0);
    expect(d.isIdle()).toBe(true);
    const p1 = d.dispatch(1);
    const p2 = d.dispatch(2);
    expect(d.isIdle()).toBe(false);
    await Promise.all([p1, p2]);
    // Allow microtasks to flush
    await delay(0);
    expect(d.isIdle()).toBe(true);
  });
});
