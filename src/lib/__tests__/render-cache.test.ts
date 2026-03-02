import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearRenderCache,
  renderCacheStats,
  getCachedSvg,
} from '@/lib/latex/mathjax-client';

describe('render cache management', () => {
  beforeEach(() => {
    clearRenderCache();
  });

  it('clearRenderCache resets size to 0', () => {
    clearRenderCache();
    expect(renderCacheStats().size).toBe(0);
  });

  it('getCachedSvg returns undefined after clearRenderCache', () => {
    expect(getCachedSvg('x^2', true)).toBeUndefined();
  });

  it('renderCacheStats returns correct maxSize', () => {
    const stats = renderCacheStats();
    expect(stats.maxSize).toBe(400);
    expect(stats.size).toBe(0);
  });

  it('clearRenderCache resets hit and miss counters', () => {
    // Generate some misses via getCachedSvg on empty cache
    getCachedSvg('a', false);
    getCachedSvg('b', false);
    clearRenderCache();
    const stats = renderCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it('hitRate is 0 when no lookups have occurred (no division by zero)', () => {
    const stats = renderCacheStats();
    expect(stats.hitRate).toBe(0);
    expect(Number.isNaN(stats.hitRate)).toBe(false);
  });

  it('getCachedSvg increments miss counter on empty cache', () => {
    getCachedSvg('x^2', true);
    const stats = renderCacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });
});
