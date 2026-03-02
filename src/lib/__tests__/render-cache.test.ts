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
});
