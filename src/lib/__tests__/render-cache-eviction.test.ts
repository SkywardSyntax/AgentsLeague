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

describe('render cache FIFO eviction', () => {
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

  it('evicts the oldest entry when cache exceeds capacity (FIFO)', async () => {
    await fillCache(400);

    // Add one more entry to trigger eviction
    await renderTexToSvg('x400', false);

    expect(renderCacheStats().size).toBe(400);
    // x0 (the first inserted) should be evicted via FIFO
    expect(getCachedSvg('x0', false)).toBeUndefined();
    // x400 (just added) should be present
    expect(getCachedSvg('x400', false)).toBeDefined();
    // x1 (second oldest) should still be present
    expect(getCachedSvg('x1', false)).toBeDefined();
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
});
