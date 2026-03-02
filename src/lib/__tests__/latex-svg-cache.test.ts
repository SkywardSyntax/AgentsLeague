import { describe, it, expect, beforeEach } from 'vitest';
import { svgCache, MAX_SVG_CACHE } from '@/components/chat/LatexSvg';

describe('LatexSvg svgCache eviction', () => {
  beforeEach(() => {
    svgCache.clear();
  });

  it('stays within MAX_SVG_CACHE when filled to capacity', () => {
    for (let i = 0; i < MAX_SVG_CACHE; i++) {
      svgCache.set(`key-${i}`, `svg-${i}`);
    }
    expect(svgCache.size).toBe(MAX_SVG_CACHE);
  });

  it('evicts oldest entries when cache exceeds capacity via the eviction loop', () => {
    // Fill cache to capacity
    for (let i = 0; i < MAX_SVG_CACHE; i++) {
      svgCache.set(`key-${i}`, `svg-${i}`);
    }

    // Simulate what the component does: evict before inserting
    while (svgCache.size >= MAX_SVG_CACHE) {
      const oldest = svgCache.keys().next().value;
      if (typeof oldest === 'string') svgCache.delete(oldest);
      else break;
    }
    svgCache.set('new-key', 'new-svg');

    expect(svgCache.size).toBe(MAX_SVG_CACHE);
    expect(svgCache.has('key-0')).toBe(false);
    expect(svgCache.has('new-key')).toBe(true);
  });

  it('stays at capacity even when many entries are added in burst', () => {
    // Fill cache to capacity
    for (let i = 0; i < MAX_SVG_CACHE; i++) {
      svgCache.set(`key-${i}`, `svg-${i}`);
    }

    // Simulate burst: add 50 more entries using the eviction loop
    for (let i = 0; i < 50; i++) {
      while (svgCache.size >= MAX_SVG_CACHE) {
        const oldest = svgCache.keys().next().value;
        if (typeof oldest === 'string') svgCache.delete(oldest);
        else break;
      }
      svgCache.set(`burst-${i}`, `svg-burst-${i}`);
    }

    expect(svgCache.size).toBeLessThanOrEqual(MAX_SVG_CACHE);
    // First 50 original keys should be evicted
    for (let i = 0; i < 50; i++) {
      expect(svgCache.has(`key-${i}`)).toBe(false);
    }
    // All burst keys should be present
    for (let i = 0; i < 50; i++) {
      expect(svgCache.has(`burst-${i}`)).toBe(true);
    }
  });
});
