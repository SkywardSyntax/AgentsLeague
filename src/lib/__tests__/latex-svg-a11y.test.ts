import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

// Mock mathjax-client to avoid dynamic imports in tests
vi.mock('@/lib/latex/mathjax-client', () => ({
  getCachedSvg: vi.fn(),
  renderTexToSvg: vi.fn(),
  clearRenderCache: vi.fn(),
}));

vi.mock('@/lib/latex/tex-errors', () => ({
  formatTexError: (err: unknown) => (err instanceof Error ? err.message : 'error'),
  isTimeoutError: (err: unknown) => err instanceof Error && err.message.includes('timed out'),
}));

import { LatexSvg } from '@/components/chat/LatexSvg';
import { getCachedSvg, renderTexToSvg } from '@/lib/latex/mathjax-client';

const mockedGetCachedSvg = vi.mocked(getCachedSvg);
const mockedRenderTexToSvg = vi.mocked(renderTexToSvg);

describe('LatexSvg accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('focuses the retry button on timeout error', async () => {
    mockedGetCachedSvg.mockReturnValue(undefined);
    mockedRenderTexToSvg.mockRejectedValue(new Error('timed out after 5000ms'));

    render(React.createElement(LatexSvg, { tex: 'x^2', displayMode: false }));

    // Wait for the error state to render
    const retryButton = await screen.findByRole('button', { name: 'Retry rendering' });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton.className).toContain('focus-visible:ring-2');
  });

  it('focuses the copy button when no retry button (non-timeout error)', async () => {
    mockedGetCachedSvg.mockReturnValue(undefined);
    mockedRenderTexToSvg.mockRejectedValue(new Error('Unknown command'));

    render(React.createElement(LatexSvg, { tex: '\\bad', displayMode: false }));

    const copyButton = await screen.findByRole('button', { name: 'Copy TeX to clipboard' });
    expect(copyButton).toBeInTheDocument();
    expect(copyButton.className).toContain('focus-visible:ring-2');
  });

  it('uses short aria-label for short TeX expressions', () => {
    const shortTex = 'x^2';
    mockedGetCachedSvg.mockReturnValue('<svg>ok</svg>');

    render(React.createElement(LatexSvg, { tex: shortTex, displayMode: false }));

    const mathEl = screen.getByRole('math');
    expect(mathEl).toHaveAttribute('aria-label', shortTex);
    expect(mathEl).toHaveAttribute('tabIndex', '0');
  });

  it('uses full aria-label for TeX under 80 chars', () => {
    const longTex = '\\frac{d}{dx}\\left(\\int_{a}^{x} f(t)\\,dt\\right) = f(x) + g(x)';
    expect(longTex.length).toBeGreaterThan(40);
    mockedGetCachedSvg.mockReturnValue('<svg>ok</svg>');

    render(React.createElement(LatexSvg, { tex: longTex, displayMode: false }));

    const mathEl = screen.getByRole('math');
    // Under 80 chars, the full TeX is used as aria-label
    expect(mathEl).toHaveAttribute('aria-label', longTex);
    expect(mathEl).toHaveAttribute('title', longTex);
    expect(mathEl).toHaveAttribute('tabIndex', '0');
  });

  it('all interactive elements have focus-visible styling', async () => {
    mockedGetCachedSvg.mockReturnValue(undefined);
    mockedRenderTexToSvg.mockRejectedValue(new Error('timed out'));

    render(React.createElement(LatexSvg, { tex: 'x', displayMode: false }));

    const buttons = await screen.findAllByRole('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('focus-visible');
    }
  });

  it('math span has tabIndex=0 for keyboard navigation', () => {
    mockedGetCachedSvg.mockReturnValue('<svg>rendered</svg>');

    render(React.createElement(LatexSvg, { tex: 'y', displayMode: true }));

    const mathEl = screen.getByRole('math');
    expect(mathEl).toHaveAttribute('tabIndex', '0');
  });
});
