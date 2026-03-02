import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('mathjax-full/js/mathjax.js', () => ({
  mathjax: {
    document: () => ({
      convert: (tex: string) => ({ __tex: tex }),
    }),
  },
}));
vi.mock('mathjax-full/js/input/tex.js', () => ({
  TeX: class {},
}));
vi.mock('mathjax-full/js/output/svg.js', () => ({
  SVG: class {},
}));
vi.mock('mathjax-full/js/adaptors/liteAdaptor.js', () => ({
  liteAdaptor: () => ({
    outerHTML: (node: { __tex: string }) => `<svg>${node.__tex}</svg>`,
  }),
}));
vi.mock('mathjax-full/js/handlers/html.js', () => ({
  RegisterHTMLHandler: () => {},
}));
vi.mock('mathjax-full/js/input/tex/AllPackages.js', () => ({
  AllPackages: [],
}));

import {
  clearRenderCache,
  renderCacheStats,
  getCachedSvg,
  renderTexToSvg,
} from '@/lib/latex/mathjax-client';

describe('render cache LRU eviction', () => {
  beforeEach(() => {
    clearRenderCache();
  });

  async function fillCache(count: number, prefix = 'x') {
    for (let i = 0; i < count; i++) {
      await renderTexToSvg(`${prefix}${i}`, false);
    }
  }

  it('fills cache to MAX_RENDER_CACHE without eviction', async () => {
    await fillCache(400);
    expect(renderCacheStats().size).toBe(400);
  });

  it('evicts the oldest entry when cache exceeds capacity', async () => {
    await fillCache(400);

    // Add one more entry to trigger eviction
    await renderTexToSvg('x400', false);

    expect(renderCacheStats().size).toBe(400);
    // x0 (the first inserted) should be evicted
    expect(getCachedSvg('x0', false)).toBeUndefined();
    // x400 (just added) should be present
    expect(getCachedSvg('x400', false)).toBeDefined();
    // x1 (second oldest) should still be present
    expect(getCachedSvg('x1', false)).toBeDefined();
  });

  it('LRU access protects entry from eviction', async () => {
    await fillCache(400);

    // Access x0 via getCachedSvg — moves it to end (LRU protection)
    expect(getCachedSvg('x0', false)).toBeDefined();

    // Add one more entry to trigger eviction — x1 should be evicted (now oldest)
    await renderTexToSvg('x400', false);

    expect(getCachedSvg('x0', false)).toBeDefined(); // protected by LRU access
    expect(getCachedSvg('x1', false)).toBeUndefined(); // evicted as oldest
  });

  it('getCachedSvg returns undefined for evicted keys', async () => {
    await fillCache(400);
    // Evict the first 3 entries by adding 3 more
    await renderTexToSvg('y0', false);
    await renderTexToSvg('y1', false);
    await renderTexToSvg('y2', false);

    expect(getCachedSvg('x0', false)).toBeUndefined();
    expect(getCachedSvg('x1', false)).toBeUndefined();
    expect(getCachedSvg('x2', false)).toBeUndefined();
    // x3 should still be present
    expect(getCachedSvg('x3', false)).toBeDefined();
  });

  it('clearRenderCache empties a full cache', async () => {
    await fillCache(400);
    expect(renderCacheStats().size).toBe(400);

    clearRenderCache();
    expect(renderCacheStats().size).toBe(0);
    expect(getCachedSvg('x0', false)).toBeUndefined();
    expect(getCachedSvg('x399', false)).toBeUndefined();
  });

  it('cache can be refilled after clear with consistent stats', async () => {
    await fillCache(400);
    clearRenderCache();
    await fillCache(400, 'z');

    const stats = renderCacheStats();
    expect(stats.size).toBe(400);
    expect(stats.maxSize).toBe(400);
    expect(getCachedSvg('z0', false)).toBeDefined();
    expect(getCachedSvg('z399', false)).toBeDefined();
  });

  it('tracks hits and misses across renderTexToSvg calls', async () => {
    clearRenderCache();
    // Cold renders are all misses
    await renderTexToSvg('a', false);
    await renderTexToSvg('b', false);
    const afterCold = renderCacheStats();
    expect(afterCold.misses).toBe(2);
    expect(afterCold.hits).toBe(0);

    // Warm renders should be cache hits
    await renderTexToSvg('a', false);
    await renderTexToSvg('b', false);
    const afterWarm = renderCacheStats();
    expect(afterWarm.hits).toBe(2);
    expect(afterWarm.misses).toBe(2);
    expect(afterWarm.hitRate).toBe(0.5);
  });

  it('deduplicates concurrent renders for the same expression', async () => {
    clearRenderCache();
    // Launch multiple concurrent renders for the same key
    const results = await Promise.all([
      renderTexToSvg('dup', false),
      renderTexToSvg('dup', false),
      renderTexToSvg('dup', false),
    ]);

    // All should return the same result
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);

    // Only one miss should be counted (the first one that started the render)
    const stats = renderCacheStats();
    expect(stats.misses).toBe(1);
  });
});
