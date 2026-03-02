import { describe, it, expect, vi } from 'vitest';
import { createSendLock } from '@/lib/chat/send-lock';

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

describe('send lock', () => {
  it('single send completes normally', async () => {
    const lock = createSendLock<string>();
    const result = await lock.acquire('msg', () => Promise.resolve('sent'));
    expect(result).toBe('sent');
  });

  it('double send returns same promise', async () => {
    const lock = createSendLock<string>();
    const sendFn = vi.fn(() => delay(50).then(() => 'sent'));
    const p1 = lock.acquire('msg', sendFn);
    const p2 = lock.acquire('msg', sendFn);
    expect(p1).toBe(p2);
    expect(sendFn).toHaveBeenCalledTimes(1);
    await p1;
  });

  it('lock releases after completion', async () => {
    const lock = createSendLock<string>();
    await lock.acquire('msg', () => Promise.resolve('sent'));
    expect(lock.isLocked('msg')).toBe(false);
  });

  it('after release, new send works', async () => {
    const lock = createSendLock<number>();
    await lock.acquire('msg', () => Promise.resolve(1));
    const result = await lock.acquire('msg', () => Promise.resolve(2));
    expect(result).toBe(2);
  });

  it('failed send releases lock', async () => {
    const lock = createSendLock<string>();
    await expect(
      lock.acquire('msg', () => Promise.reject(new Error('fail'))),
    ).rejects.toThrow('fail');
    expect(lock.isLocked('msg')).toBe(false);
  });

  it('isLocked reflects current state', async () => {
    const lock = createSendLock<string>();
    expect(lock.isLocked('msg')).toBe(false);
    const p = lock.acquire('msg', () => delay(30).then(() => 'ok'));
    expect(lock.isLocked('msg')).toBe(true);
    await p;
    expect(lock.isLocked('msg')).toBe(false);
  });

  it('triple rapid send — all get same result', async () => {
    const lock = createSendLock<string>();
    const sendFn = vi.fn(() => delay(20).then(() => 'result'));
    const p1 = lock.acquire('msg', sendFn);
    const p2 = lock.acquire('msg', sendFn);
    const p3 = lock.acquire('msg', sendFn);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('different keys are independent locks', async () => {
    const lock = createSendLock<string>();
    const fn1 = vi.fn(() => delay(20).then(() => 'a'));
    const fn2 = vi.fn(() => delay(20).then(() => 'b'));
    const p1 = lock.acquire('key1', fn1);
    const p2 = lock.acquire('key2', fn2);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    await Promise.all([p1, p2]);
  });

  it('manual release allows new send for same key', async () => {
    const lock = createSendLock<string>();
    const p1 = lock.acquire('msg', () => delay(500).then(() => 'slow'));
    lock.release('msg');
    expect(lock.isLocked('msg')).toBe(false);
    const p2 = lock.acquire('msg', () => Promise.resolve('fast'));
    expect(await p2).toBe('fast');
    // p1 still resolves eventually but is detached
    await p1;
  });

  it('reentrant call from within callback is safe', async () => {
    const lock = createSendLock<string>();
    const result = await lock.acquire('msg', async () => {
      // Attempt reentrant acquire with different key
      const inner = await lock.acquire('other', () => Promise.resolve('inner'));
      return `outer-${inner}`;
    });
    expect(result).toBe('outer-inner');
  });
});
