import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';

// ── Mocks ──────────────────────────────────────────────────────────────

const renderTexToSvgMock = vi.fn<
  (tex: string, displayMode: boolean, timeoutMs?: number) => Promise<string>
>();
const getCachedSvgMock = vi.fn<(tex: string, displayMode: boolean) => string | undefined>();
const extractSvgStrokesMock = vi.fn();

vi.mock('@/lib/latex/mathjax-client', () => ({
  renderTexToSvg: (...args: unknown[]) => renderTexToSvgMock(...(args as [string, boolean, number?])),
  getCachedSvg: (...args: unknown[]) => getCachedSvgMock(...(args as [string, boolean])),
  extractSvgStrokes: (...args: unknown[]) => extractSvgStrokesMock(...args),
  clearRenderCache: vi.fn(),
  renderCacheStats: vi.fn(() => ({ size: 0, maxSize: 400, hits: 0, misses: 0, hitRate: 0 })),
}));

vi.mock('@/lib/latex/tex-errors', () => ({
  formatTexError: (_err: unknown, tex: string) => `Invalid LaTeX: ${tex}`,
  isTimeoutError: () => false,
}));

import { LatexSvg } from '@/components/chat/LatexSvg';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import type { DrawBatch, StrokeTrajectory } from '@/types/agent';

// Minimal valid SVG returned by mock
const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>';
const FAKE_STROKES: StrokeTrajectory[] = [
  {
    id: 'stroke-1',
    elementId: 'el-1',
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ],
    color: '#000',
    baseWidth: 1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getCachedSvgMock.mockReturnValue(undefined);
});

afterEach(() => {
  cleanup();
});

// ── LatexSvg component tests ───────────────────────────────────────────

describe('LatexSvg error recovery', () => {
  it('shows raw TeX in <code> when renderTexToSvg throws', async () => {
    renderTexToSvgMock.mockRejectedValue(new Error('parse error'));

    let container: HTMLElement;
    await act(async () => {
      const result = render(React.createElement(LatexSvg, { tex: 'x^2', displayMode: false }));
      container = result.container;
    });

    // Wait for async effect to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const code = container!.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toContain('x^2');
  });

  it('shows "Rendering…" while async render is in progress', async () => {
    // Never-resolving promise
    renderTexToSvgMock.mockReturnValue(new Promise<string>(() => {}));

    let container: HTMLElement;
    await act(async () => {
      const result = render(React.createElement(LatexSvg, { tex: 'x^2', displayMode: false }));
      container = result.container;
    });

    expect(container!.textContent).toContain('Rendering…');
  });

  it('recovers from error to success on prop change', async () => {
    // First render: fail
    renderTexToSvgMock.mockRejectedValueOnce(new Error('bad'));

    let container: HTMLElement;
    let rerender: (ui: React.ReactElement) => void;
    await act(async () => {
      const result = render(React.createElement(LatexSvg, { tex: 'bad_tex', displayMode: false }));
      container = result.container;
      rerender = result.rerender;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container!.querySelector('code')).not.toBeNull();

    // Second render: succeed
    renderTexToSvgMock.mockResolvedValueOnce(VALID_SVG);
    await act(async () => {
      rerender!(React.createElement(LatexSvg, { tex: 'x^2', displayMode: false }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container!.querySelector('code')).toBeNull();
    // Should show rendered SVG (or sanitized version of it)
    const mathSpan = container!.querySelector('[role="math"]');
    expect(mathSpan).not.toBeNull();
  });

  it('cache prevents re-rendering on remount', async () => {
    renderTexToSvgMock.mockResolvedValue(VALID_SVG);

    // First mount
    let container: HTMLElement;
    let unmount: () => void;
    await act(async () => {
      const result = render(React.createElement(LatexSvg, { tex: 'y=mx+b', displayMode: false }));
      container = result.container;
      unmount = result.unmount;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(renderTexToSvgMock).toHaveBeenCalledTimes(1);

    // Cache the result on second mount
    getCachedSvgMock.mockReturnValue(VALID_SVG);
    await act(async () => {
      unmount!();
    });

    // Remount with same props — should use cache
    await act(async () => {
      const result = render(React.createElement(LatexSvg, { tex: 'y=mx+b', displayMode: false }));
      container = result.container;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // renderTexToSvg should NOT have been called again (cache hit)
    expect(renderTexToSvgMock).toHaveBeenCalledTimes(1);
    const mathSpan = container!.querySelector('[role="math"]');
    expect(mathSpan).not.toBeNull();
  });
});

// ── compileBatchToStrokes tests ────────────────────────────────────────

describe('compileBatchToStrokes error recovery', () => {
  beforeEach(() => {
    extractSvgStrokesMock.mockReturnValue(FAKE_STROKES);
  });

  it('returns warning when latex element fails completely', async () => {
    renderTexToSvgMock.mockRejectedValue(new Error('LaTeX parse error'));

    const batch: DrawBatch = {
      batch_id: 'b1',
      elements: [
        { id: 'eq1', type: 'latex', x: 0, y: 0, tex: 'x^2' },
      ],
    };

    const result = await compileBatchToStrokes(batch);
    expect(result.warnings.some((w) => w.includes('LaTeX parse error'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Fallback text failed'))).toBe(true);
  });

  it('uses \\texttt{} fallback when primary LaTeX fails', async () => {
    // First call (primary) throws, second call (texttt fallback) succeeds
    renderTexToSvgMock
      .mockRejectedValueOnce(new Error('bad'))
      .mockResolvedValueOnce(VALID_SVG);

    const batch: DrawBatch = {
      batch_id: 'b2',
      elements: [
        { id: 'eq2', type: 'latex', x: 10, y: 10, tex: '\\invalid' },
      ],
    };

    const result = await compileBatchToStrokes(batch);
    expect(result.strokes.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('fallback used'))).toBe(true);
    // Should NOT have the "Fallback text failed" warning since texttt worked
    expect(result.warnings.some((w) => w.includes('Fallback text failed'))).toBe(false);
  });

  it('warns when both LaTeX and texttt fallback fail', async () => {
    renderTexToSvgMock.mockRejectedValue(new Error('all fail'));

    const batch: DrawBatch = {
      batch_id: 'b3',
      elements: [
        { id: 'eq3', type: 'latex', x: 0, y: 0, tex: 'x^2' },
      ],
    };

    const result = await compileBatchToStrokes(batch);
    expect(result.warnings.some((w) => w.includes('LaTeX parse error'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Fallback text failed'))).toBe(true);
  });

  it('handles text element with math-like content via looksMathLikeText retry', async () => {
    // parseStreamingLatex path fails (renderTexToSvg throws for text segments),
    // but looksMathLikeText succeeds on the retry path
    let callCount = 0;
    renderTexToSvgMock.mockImplementation(async () => {
      callCount++;
      // First calls fail (streaming path), later call succeeds (looksMathLikeText retry)
      if (callCount <= 1) {
        throw new Error('fail streaming');
      }
      return VALID_SVG;
    });

    const batch: DrawBatch = {
      batch_id: 'b4',
      elements: [
        { id: 't1', type: 'text', x: 0, y: 0, text: 'x^2 + y^2 = r^2', size: 18 },
      ],
    };

    const result = await compileBatchToStrokes(batch);
    // looksMathLikeText should detect the math-like content and retry
    expect(result.strokes.length).toBeGreaterThan(0);
  });

  it('text element produces warning on total failure', async () => {
    renderTexToSvgMock.mockRejectedValue(new Error('total failure'));

    const batch: DrawBatch = {
      batch_id: 'b5',
      elements: [
        { id: 't2', type: 'text', x: 0, y: 0, text: 'Hello world', size: 18 },
      ],
    };

    const result = await compileBatchToStrokes(batch);
    expect(result.warnings.some((w) => w.includes('Text render fallback'))).toBe(true);
  });

  it('continues processing remaining elements after one fails', async () => {
    // latex fails, rect succeeds (no render needed), text fails
    renderTexToSvgMock.mockRejectedValue(new Error('render fail'));

    const batch: DrawBatch = {
      batch_id: 'b6',
      elements: [
        { id: 'eq-fail', type: 'latex', x: 0, y: 0, tex: '\\bad' },
        { id: 'r1', type: 'rect', x: 50, y: 50, w: 100, h: 80 },
        { id: 't-fail', type: 'text', x: 0, y: 200, text: 'Some text', size: 18 },
      ],
    };

    const result = await compileBatchToStrokes(batch);

    // Rect should be in strokes
    const rectStrokes = result.strokes.filter((s) => s.elementId === 'r1');
    expect(rectStrokes.length).toBeGreaterThan(0);

    // Both failing elements should have warnings
    expect(result.warnings.some((w) => w.includes('eq-fail'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('t-fail'))).toBe(true);
  });
});
