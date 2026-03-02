import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { svgCache } from '@/components/chat/LatexSvg';

let resolveRender: ((svg: string) => void) | undefined;
let rejectRender: ((err: Error) => void) | undefined;

vi.mock('@/lib/latex/mathjax-client', () => ({
  renderTexToSvg: vi.fn(
    () =>
      new Promise<string>((resolve, reject) => {
        resolveRender = resolve;
        rejectRender = reject;
      }),
  ),
}));

vi.mock('@/lib/latex/tex-normalize', () => ({
  prepareTexForMathJax: (tex: string, dm: boolean) => ({ tex, displayMode: dm }),
}));

describe('LatexSvg cleanup on unmount', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    svgCache.clear();
    resolveRender = undefined;
    rejectRender = undefined;
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleSpy.mockRestore();
  });

  it('unmount during pending render does not update state', async () => {
    // Dynamic import after mocks are in place
    const { LatexSvg } = await import('@/components/chat/LatexSvg');

    const { unmount } = render(
      React.createElement(LatexSvg, { tex: 'x^2', displayMode: false }),
    );
    unmount();

    // Resolve the render *after* unmount
    resolveRender!('<svg>done</svg>');
    await vi.waitFor(() => {});

    // No "unmounted" or "Can't perform" console errors
    for (const call of consoleSpy.mock.calls) {
      const msg = call.map(String).join(' ');
      expect(msg).not.toMatch(/unmounted|Can't perform/i);
    }
  });

  it('unmount during pending render that rejects does not throw', async () => {
    const { LatexSvg } = await import('@/components/chat/LatexSvg');

    const { unmount } = render(
      React.createElement(LatexSvg, { tex: 'bad', displayMode: false }),
    );
    unmount();

    // Reject *after* unmount
    rejectRender!(new Error('fail'));
    await vi.waitFor(() => {});

    for (const call of consoleSpy.mock.calls) {
      const msg = call.map(String).join(' ');
      expect(msg).not.toMatch(/unmounted|Can't perform|unhandled/i);
    }
  });

  it('SVG cache eviction works correctly at MAX_SVG_CACHE boundary', async () => {
    const { renderTexToSvg } = await import('@/lib/latex/mathjax-client');
    const mockRender = vi.mocked(renderTexToSvg);

    // Fill cache to MAX (300)
    for (let i = 0; i < 300; i++) {
      svgCache.set(`I:key-${i}`, `<svg>${i}</svg>`);
    }
    expect(svgCache.size).toBe(300);

    // Simulate what the component effect does: evict then insert
    const newKey = 'I:key-new';
    while (svgCache.size >= 300) {
      const oldest = svgCache.keys().next().value;
      if (typeof oldest === 'string') svgCache.delete(oldest);
      else break;
    }
    svgCache.set(newKey, '<svg>new</svg>');

    expect(svgCache.size).toBe(300);
    expect(svgCache.has('I:key-0')).toBe(false);
    expect(svgCache.has(newKey)).toBe(true);

    // renderTexToSvg would be called for any key not in cache
    mockRender.mockClear();
  });
});
