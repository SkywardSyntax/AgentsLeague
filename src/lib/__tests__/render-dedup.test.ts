import { describe, it, expect, vi } from 'vitest';
import { createRenderDedup } from '@/lib/latex/render-dedup';

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

describe('render dedup', () => {
  it('single render completes normally', async () => {
    const dedup = createRenderDedup();
    const result = await dedup.render('x^2', false, () => Promise.resolve('<svg>x2</svg>'));
    expect(result).toBe('<svg>x2</svg>');
  });

  it('duplicate concurrent render returns same promise', async () => {
    const dedup = createRenderDedup();
    const renderFn = vi.fn(() => delay(30).then(() => '<svg/>'));
    const p1 = dedup.render('x^2', false, renderFn);
    const p2 = dedup.render('x^2', false, renderFn);
    expect(p1).toBe(p2);
    expect(renderFn).toHaveBeenCalledTimes(1);
    await p1;
  });

  it('after completion, new render starts fresh', async () => {
    const dedup = createRenderDedup();
    const renderFn = vi.fn(() => Promise.resolve('<svg/>'));
    await dedup.render('x^2', false, renderFn);
    await dedup.render('x^2', false, renderFn);
    expect(renderFn).toHaveBeenCalledTimes(2);
  });

  it('failed render clears pending entry', async () => {
    const dedup = createRenderDedup();
    let calls = 0;
    const renderFn = vi.fn(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('fail'));
      return Promise.resolve('<svg/>');
    });
    await expect(dedup.render('x^2', false, renderFn)).rejects.toThrow('fail');
    expect(dedup.pendingCount()).toBe(0);
    const result = await dedup.render('x^2', false, renderFn);
    expect(result).toBe('<svg/>');
  });

  it('different expressions are independent', async () => {
    const dedup = createRenderDedup();
    const fn1 = vi.fn(() => delay(20).then(() => 'svg-a'));
    const fn2 = vi.fn(() => delay(20).then(() => 'svg-b'));
    const p1 = dedup.render('a', false, fn1);
    const p2 = dedup.render('b', false, fn2);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('svg-a');
    expect(r2).toBe('svg-b');
  });

  it('cache key includes display mode', async () => {
    const dedup = createRenderDedup();
    const renderFn = vi.fn((_tex: string, dm: boolean) =>
      Promise.resolve(dm ? 'display' : 'inline'),
    );
    const p1 = dedup.render('x', true, renderFn);
    const p2 = dedup.render('x', false, renderFn);
    expect(renderFn).toHaveBeenCalledTimes(2);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('display');
    expect(r2).toBe('inline');
  });

  it('triple concurrent same-expression — one render call', async () => {
    const dedup = createRenderDedup();
    const renderFn = vi.fn(() => delay(20).then(() => 'svg'));
    const p1 = dedup.render('x', false, renderFn);
    const p2 = dedup.render('x', false, renderFn);
    const p3 = dedup.render('x', false, renderFn);
    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['svg', 'svg', 'svg']);
    expect(renderFn).toHaveBeenCalledTimes(1);
  });

  it('render result is shared across all waiters', async () => {
    const dedup = createRenderDedup();
    const renderFn = vi.fn(() => delay(20).then(() => 'shared'));
    const promises = Array.from({ length: 5 }, () => dedup.render('z', true, renderFn));
    const results = await Promise.all(promises);
    expect(results.every((r) => r === 'shared')).toBe(true);
    expect(renderFn).toHaveBeenCalledTimes(1);
  });

  it('error propagates to all waiters', async () => {
    const dedup = createRenderDedup();
    const renderFn = vi.fn(() => delay(10).then(() => { throw new Error('boom'); }));
    const p1 = dedup.render('x', false, renderFn);
    const p2 = dedup.render('x', false, renderFn);
    await expect(p1).rejects.toThrow('boom');
    await expect(p2).rejects.toThrow('boom');
  });

  it('rapid sequential renders with varying expressions', async () => {
    const dedup = createRenderDedup();
    const renderFn = vi.fn((tex: string) => Promise.resolve(`svg-${tex}`));
    const results = await Promise.all([
      dedup.render('a', false, renderFn),
      dedup.render('b', false, renderFn),
      dedup.render('a', false, renderFn),
      dedup.render('c', false, renderFn),
    ]);
    expect(results).toEqual(['svg-a', 'svg-b', 'svg-a', 'svg-c']);
    // 'a' was called once since both concurrent calls share the same promise
    expect(renderFn).toHaveBeenCalledTimes(3);
  });
});
