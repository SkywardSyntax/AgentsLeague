import { describe, expect, it } from 'vitest';
import { createLazyLoader } from '@/lib/lazy/lazy-utils';

describe('lazy-utils', () => {
  it('createLazyLoader returns object with status, load, preload, getModule', () => {
    const loader = createLazyLoader(() => Promise.resolve({ value: 1 }));
    expect(loader.status).toBeDefined();
    expect(typeof loader.load).toBe('function');
    expect(typeof loader.preload).toBe('function');
    expect(typeof loader.getModule).toBe('function');
  });

  it('initial status is idle', () => {
    const loader = createLazyLoader(() => Promise.resolve('mod'));
    expect(loader.status).toBe('idle');
  });

  it('after calling load(), status transitions to loading', () => {
    let resolveFn: (v: string) => void;
    const loader = createLazyLoader(
      () => new Promise<string>((resolve) => { resolveFn = resolve; }),
    );
    loader.load();
    expect(loader.status).toBe('loading');
    resolveFn!('done');
  });

  it('after load() resolves, status transitions to loaded', async () => {
    const loader = createLazyLoader(() => Promise.resolve('mod'));
    await loader.load();
    expect(loader.status).toBe('loaded');
  });

  it('after load() rejects, status transitions to error', async () => {
    const loader = createLazyLoader(() => Promise.reject(new Error('fail')));
    await loader.load().catch(() => {});
    expect(loader.status).toBe('error');
    expect(loader.getError()).toBe('fail');
  });

  it('getModule returns null before load, module after load', async () => {
    const mod = { component: 'Test' };
    const loader = createLazyLoader(() => Promise.resolve(mod));
    expect(loader.getModule()).toBeNull();
    await loader.load();
    expect(loader.getModule()).toBe(mod);
  });

  it('calling load() twice returns same promise (no double fetch)', () => {
    let callCount = 0;
    const loader = createLazyLoader(() => {
      callCount++;
      return Promise.resolve('mod');
    });
    const p1 = loader.load();
    const p2 = loader.load();
    expect(p1).toBe(p2);
    expect(callCount).toBe(1);
  });

  it('preload triggers load but does not throw on error', () => {
    const loader = createLazyLoader(() => Promise.reject(new Error('oops')));
    // Should not throw
    expect(() => loader.preload()).not.toThrow();
  });

  it('after error, calling load() again retries', async () => {
    let attempt = 0;
    const loader = createLazyLoader(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('fail'));
      return Promise.resolve('success');
    });
    await loader.load().catch(() => {});
    expect(loader.status).toBe('error');
    const result = await loader.load();
    expect(result).toBe('success');
    expect(loader.status).toBe('loaded');
  });

  it('getLoadTimeMs returns elapsed time after completion', async () => {
    const loader = createLazyLoader(
      () => new Promise((resolve) => setTimeout(() => resolve('mod'), 10)),
    );
    expect(loader.getLoadTimeMs()).toBeNull();
    await loader.load();
    const time = loader.getLoadTimeMs();
    expect(time).not.toBeNull();
    expect(time!).toBeGreaterThanOrEqual(0);
  });
});
