import { describe, expect, it } from 'vitest';
import { normalizeTexForMathJax, prepareTexForMathJax } from '@/lib/latex/tex-normalize';

describe('normalizeTexForMathJax idempotency', () => {
  it('is idempotent on $$x^2$$', () => {
    const once = normalizeTexForMathJax('$$x^2$$');
    const twice = normalizeTexForMathJax(once);
    expect(twice).toBe(once);
  });

  it('is idempotent on \\\\frac{a}{b}', () => {
    const once = normalizeTexForMathJax('\\\\frac{a}{b}');
    const twice = normalizeTexForMathJax(once);
    expect(twice).toBe(once);
  });

  it('is idempotent on $\\\\alpha$', () => {
    const once = normalizeTexForMathJax('$\\\\alpha$');
    const twice = normalizeTexForMathJax(once);
    expect(twice).toBe(once);
  });

  it('is idempotent on \\\\[x + y\\\\]', () => {
    const once = normalizeTexForMathJax('\\[x + y\\]');
    const twice = normalizeTexForMathJax(once);
    expect(twice).toBe(once);
  });

  it('is idempotent on already-clean input x^2 + y^2', () => {
    const once = normalizeTexForMathJax('x^2 + y^2');
    const twice = normalizeTexForMathJax(once);
    expect(twice).toBe(once);
  });

  it('with NBSP characters is idempotent', () => {
    const once = normalizeTexForMathJax('x\u00a0+\u00a0y');
    const twice = normalizeTexForMathJax(once);
    expect(twice).toBe(once);
  });

  it('with nested dollar signs $a = $b$ is stable across 3 calls', () => {
    const once = normalizeTexForMathJax('$a = $b$');
    const twice = normalizeTexForMathJax(once);
    const thrice = normalizeTexForMathJax(twice);
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
  });
});

describe('prepareTexForMathJax idempotency', () => {
  it('is idempotent on tex output', () => {
    const first = prepareTexForMathJax('$$x^2 + y^2$$');
    const second = prepareTexForMathJax(first.tex, first.displayMode);
    expect(second.tex).toBe(first.tex);
    expect(second.displayMode).toBe(first.displayMode);
  });

  it('is idempotent with \\begin{equation}...\\end{equation}', () => {
    const first = prepareTexForMathJax('\\begin{equation}E=mc^2\\end{equation}');
    expect(first.displayMode).toBe(true);
    const second = prepareTexForMathJax(first.tex, first.displayMode);
    expect(second.tex).toBe(first.tex);
    expect(second.displayMode).toBe(true);
  });

  it('with displayMode undefined resolves from delimiters then stabilizes', () => {
    const first = prepareTexForMathJax('$$\\sum_{i=1}^{n} i$$', undefined);
    const second = prepareTexForMathJax(first.tex, first.displayMode);
    expect(second.tex).toBe(first.tex);
    expect(second.displayMode).toBe(first.displayMode);
  });
});
