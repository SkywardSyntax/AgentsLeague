import { describe, expect, it } from 'vitest';
import { createSendLock } from '@/lib/chat/send-lock';

describe('send-lock edge cases', () => {
  it('isLocked returns false for a key that was never acquired', () => {
    const lock = createSendLock<string>();
    expect(lock.isLocked('unknown-key')).toBe(false);
  });

  it('isLocked returns true while promise is in-flight', async () => {
    const lock = createSendLock<string>();
    let resolveFn!: (v: string) => void;
    const p = new Promise<string>((r) => { resolveFn = r; });

    lock.acquire('k1', () => p);
    expect(lock.isLocked('k1')).toBe(true);

    resolveFn('done');
    await p;
    // Wait for finally() to run
    await new Promise((r) => setTimeout(r, 0));
    expect(lock.isLocked('k1')).toBe(false);
  });

  it('concurrent acquire on same key returns the same promise', async () => {
    const lock = createSendLock<number>();
    let callCount = 0;
    const sendFn = () => { callCount++; return Promise.resolve(42); };

    const p1 = lock.acquire('k', sendFn);
    const p2 = lock.acquire('k', sendFn);

    expect(p1).toBe(p2);
    await p1;
    expect(callCount).toBe(1);
  });

  it('different keys run independently', async () => {
    const lock = createSendLock<string>();
    const results: string[] = [];

    await Promise.all([
      lock.acquire('a', async () => { results.push('a'); return 'a'; }),
      lock.acquire('b', async () => { results.push('b'); return 'b'; }),
    ]);

    expect(results).toContain('a');
    expect(results).toContain('b');
  });

  it('auto-releases lock when sendFn throws', async () => {
    const lock = createSendLock<string>();

    await lock.acquire('err', () => Promise.reject(new Error('boom'))).catch(() => {});
    // Wait for finally()
    await new Promise((r) => setTimeout(r, 0));

    expect(lock.isLocked('err')).toBe(false);
  });

  it('manual release before promise resolves clears the lock', async () => {
    const lock = createSendLock<string>();
    let resolveFn!: (v: string) => void;
    const p = new Promise<string>((r) => { resolveFn = r; });

    lock.acquire('k', () => p);
    expect(lock.isLocked('k')).toBe(true);

    lock.release('k');
    expect(lock.isLocked('k')).toBe(false);

    resolveFn('done');
    await p;
  });

  it('re-acquire after release runs new sendFn', async () => {
    const lock = createSendLock<number>();
    const r1 = await lock.acquire('k', () => Promise.resolve(1));
    await new Promise((r) => setTimeout(r, 0));
    const r2 = await lock.acquire('k', () => Promise.resolve(2));
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  it('sequential acquires after each resolves all succeed', async () => {
    const lock = createSendLock<number>();
    const results: number[] = [];

    for (let i = 0; i < 5; i++) {
      const val = await lock.acquire('seq', () => Promise.resolve(i));
      results.push(val);
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it('release on non-existent key does not throw', () => {
    const lock = createSendLock<string>();
    expect(() => lock.release('no-such-key')).not.toThrow();
  });

  it('acquire returns resolved value from sendFn', async () => {
    const lock = createSendLock<{ id: number }>();
    const result = await lock.acquire('obj', () => Promise.resolve({ id: 99 }));
    expect(result).toEqual({ id: 99 });
  });
});
