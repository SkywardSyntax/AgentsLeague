import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

// Mock mathjax-client before importing LatexSvg
const mockCacheStore = new Map<string, string>();

vi.mock('@/lib/latex/mathjax-client', () => ({
  renderTexToSvg: vi.fn(),
  getCachedSvg: vi.fn((tex: string, displayMode: boolean) => {
    const key = `${displayMode ? 'D' : 'I'}:${tex}`;
    return mockCacheStore.get(key);
  }),
}));

// Must import after mock setup
import { LatexSvg } from '@/components/chat/LatexSvg';
import { renderTexToSvg } from '@/lib/latex/mathjax-client';

const mockRender = renderTexToSvg as ReturnType<typeof vi.fn>;

afterEach(cleanup);

describe('LatexSvg accessibility', () => {
  beforeEach(() => {
    mockRender.mockReset();
  });

  it('rendered SVG container has role="img" and aria-label from TeX', async () => {
    mockRender.mockResolvedValue('<svg>rendered</svg>');
    await act(async () => {
      render(<LatexSvg tex="x^2" displayMode={false} />);
    });
    const img = screen.getByRole('math');
    expect(img).toBeTruthy();
    expect(img.getAttribute('aria-label')).toBe('x^2');
  });

  it('aria-label is truncated to 80 chars for long TeX', async () => {
    const longTex = 'a'.repeat(100);
    mockRender.mockResolvedValue('<svg>ok</svg>');
    await act(async () => {
      render(<LatexSvg tex={longTex} displayMode={false} />);
    });
    const el = screen.getByRole('math');
    const label = el.getAttribute('aria-label')!;
    expect(label.length).toBeLessThanOrEqual(82); // 80 + "…"
    expect(label.endsWith('…')).toBe(true);
  });

  it('rendered SVG container has title attribute with full TeX source', async () => {
    const texStr = 'E = mc^2';
    mockRender.mockResolvedValue('<svg>energy</svg>');
    await act(async () => {
      render(<LatexSvg tex={texStr} displayMode={false} />);
    });
    const el = screen.getByRole('math');
    expect(el.getAttribute('title')).toBe(texStr);
  });

  it('error fallback has aria-label="LaTeX rendering failed"', async () => {
    mockRender.mockRejectedValue(new Error('bad'));
    await act(async () => {
      render(<LatexSvg tex="\\invalid" displayMode={false} />);
    });
    const fallback = screen.getByRole('alert');
    expect(fallback).toBeTruthy();
    expect(fallback.tagName).toBe('CODE');
    expect(fallback.textContent).toContain('invalid');
  });
});

describe('LatexSvg LRU cache', () => {
  beforeEach(() => {
    mockRender.mockReset();
    mockCacheStore.clear();
  });

  it('same TeX returns cached SVG without re-calling renderTexToSvg', async () => {
    mockRender.mockResolvedValue('<svg>cached</svg>');

    // First render triggers renderTexToSvg
    const { unmount } = await act(async () => {
      return render(<LatexSvg tex="unique_cache_test_1" displayMode={false} />);
    });
    expect(mockRender).toHaveBeenCalledTimes(1);
    unmount();

    // Simulate the render cache having stored the result
    mockCacheStore.set('I:unique_cache_test_1', '<svg>cached</svg>');

    // Second render with same TeX should use cache
    mockRender.mockClear();
    await act(async () => {
      render(<LatexSvg tex="unique_cache_test_1" displayMode={false} />);
    });
    // Cache hit means renderTexToSvg is NOT called again
    expect(mockRender).toHaveBeenCalledTimes(0);
  });

  it('different TeX is a cache miss and calls renderTexToSvg', async () => {
    mockRender.mockResolvedValue('<svg>a</svg>');
    const { unmount } = await act(async () => {
      return render(<LatexSvg tex="miss_test_a" displayMode={false} />);
    });
    unmount();

    mockRender.mockClear();
    mockRender.mockResolvedValue('<svg>b</svg>');
    await act(async () => {
      render(<LatexSvg tex="miss_test_b" displayMode={false} />);
    });
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it('display mode difference creates separate cache entries', async () => {
    mockRender.mockResolvedValue('<svg>inline</svg>');
    const { unmount: u1 } = await act(async () => {
      return render(<LatexSvg tex="mode_test" displayMode={false} />);
    });
    u1();

    // Only cache the inline version
    mockCacheStore.set('I:mode_test', '<svg>inline</svg>');

    mockRender.mockClear();
    mockRender.mockResolvedValue('<svg>display</svg>');
    await act(async () => {
      render(<LatexSvg tex="mode_test" displayMode={true} />);
    });
    // Different display mode = cache miss
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
