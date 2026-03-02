import { describe, it, expect, vi } from 'vitest';
import {
  createLatexFallbackChain,
  type LatexRenderer,
} from '../latex/render-fallback-chain';

function makeRenderer(
  name: string,
  impl: (tex: string, display: boolean) => Promise<string>,
): LatexRenderer {
  return { name, render: impl };
}

describe('LaTeX fallback chain', () => {
  it('returns first renderer output when it succeeds', async () => {
    const chain = createLatexFallbackChain([
      makeRenderer('primary', async (tex) => `<svg>${tex}</svg>`),
      makeRenderer('secondary', async (tex) => `<img>${tex}</img>`),
    ]);

    const result = await chain.renderWithFallback('x^2', true);
    expect(result).toBe('<svg>x^2</svg>');
  });

  it('falls back to second renderer when first throws', async () => {
    const chain = createLatexFallbackChain([
      makeRenderer('primary', async () => {
        throw new Error('MathJax failed');
      }),
      makeRenderer('secondary', async (tex) => `<img>${tex}</img>`),
    ]);

    const result = await chain.renderWithFallback('x^2', true);
    expect(result).toBe('<img>x^2</img>');
  });

  it('traverses full chain when first two renderers throw', async () => {
    const chain = createLatexFallbackChain([
      makeRenderer('a', async () => {
        throw new Error('fail-a');
      }),
      makeRenderer('b', async () => {
        throw new Error('fail-b');
      }),
      makeRenderer('c', async (tex) => `<c>${tex}</c>`),
    ]);

    const result = await chain.renderWithFallback('y', false);
    expect(result).toBe('<c>y</c>');
  });

  it('returns raw TeX in <code> tags when all renderers fail', async () => {
    const chain = createLatexFallbackChain([
      makeRenderer('a', async () => {
        throw new Error('fail');
      }),
      makeRenderer('b', async () => {
        throw new Error('fail');
      }),
    ]);

    const result = await chain.renderWithFallback('\\frac{1}{2}', true);
    expect(result).toBe('<code>\\frac{1}{2}</code>');
  });

  it('onFallback receives (fromName, toName, error) on each fallback step', async () => {
    const onFallback = vi.fn();
    const chain = createLatexFallbackChain(
      [
        makeRenderer('primary', async () => {
          throw new Error('primary-err');
        }),
        makeRenderer('secondary', async (tex) => `<ok>${tex}</ok>`),
      ],
      { onFallback },
    );

    await chain.renderWithFallback('x', true);

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith(
      'primary',
      'secondary',
      expect.objectContaining({ message: 'primary-err' }),
    );
  });

  it('onFallback is not called when first renderer succeeds', async () => {
    const onFallback = vi.fn();
    const chain = createLatexFallbackChain(
      [makeRenderer('primary', async (tex) => `<svg>${tex}</svg>`)],
      { onFallback },
    );

    await chain.renderWithFallback('x', true);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('lastUsedRenderer returns name of successful renderer', async () => {
    const chain = createLatexFallbackChain([
      makeRenderer('primary', async () => {
        throw new Error('fail');
      }),
      makeRenderer('secondary', async (tex) => `<ok>${tex}</ok>`),
    ]);

    await chain.renderWithFallback('x', true);
    expect(chain.lastUsedRenderer()).toBe('secondary');
  });

  it('lastUsedRenderer returns "raw" when all renderers fail', async () => {
    const chain = createLatexFallbackChain([
      makeRenderer('only', async () => {
        throw new Error('fail');
      }),
    ]);

    await chain.renderWithFallback('x', true);
    expect(chain.lastUsedRenderer()).toBe('raw');
  });

  it('empty renderer array causes immediate raw TeX fallback', async () => {
    const chain = createLatexFallbackChain([]);

    const result = await chain.renderWithFallback('x^2', true);
    expect(result).toBe('<code>x^2</code>');
    expect(chain.lastUsedRenderer()).toBe('raw');
  });

  it('renderer returning empty string triggers fallback to next', async () => {
    const onFallback = vi.fn();
    const chain = createLatexFallbackChain(
      [
        makeRenderer('empty', async () => ''),
        makeRenderer('good', async (tex) => `<ok>${tex}</ok>`),
      ],
      { onFallback },
    );

    const result = await chain.renderWithFallback('x', false);
    expect(result).toBe('<ok>x</ok>');
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith(
      'empty',
      'good',
      expect.objectContaining({ message: 'Renderer returned empty output' }),
    );
    expect(chain.lastUsedRenderer()).toBe('good');
  });
});
