import { describe, expect, it } from 'vitest';
import { normalizeTexForMathJax, prepareTexForMathJax } from '@/lib/latex/tex-normalize';

describe('iter28 · TeX normalization completeness', () => {
  it('strips $$...$$ and sets displayMode=true', () => {
    const result = prepareTexForMathJax('$$x^2 + y^2 = r^2$$');
    expect(result.tex).toBe('x^2 + y^2 = r^2');
    expect(result.displayMode).toBe(true);
  });

  it('strips \\[...\\] and sets displayMode=true', () => {
    const result = prepareTexForMathJax('\\[\\frac{a}{b}\\]');
    expect(result.tex).toBe('\\frac{a}{b}');
    expect(result.displayMode).toBe(true);
  });

  it('strips \\(...\\) and sets displayMode=false', () => {
    const result = prepareTexForMathJax('\\(e=mc^2\\)');
    expect(result.tex).toBe('e=mc^2');
    expect(result.displayMode).toBe(false);
  });

  it('strips $...$ and sets displayMode=false', () => {
    const result = prepareTexForMathJax('$\\alpha + \\beta$');
    expect(result.tex).toBe('\\alpha + \\beta');
    expect(result.displayMode).toBe(false);
  });

  it('strips \\begin{equation}...\\end{equation} and sets displayMode=true', () => {
    const result = prepareTexForMathJax('\\begin{equation}E = mc^2\\end{equation}');
    expect(result.tex).toBe('E = mc^2');
    expect(result.displayMode).toBe(true);
  });

  it('normalizes over-escaped \\\\frac to \\frac', () => {
    const result = normalizeTexForMathJax('\\\\frac{1}{2} + \\\\sqrt{x}');
    expect(result).toBe('\\frac{1}{2} + \\sqrt{x}');
  });

  it('replaces non-breaking spaces (U+00A0) with regular spaces', () => {
    const input = 'x\u00a0+\u00a0y';
    const result = normalizeTexForMathJax(input);
    expect(result).toBe('x + y');
    expect(result).not.toContain('\u00a0');
  });

  it('nested delimiters not double-stripped — inner $ inside $$ preserved', () => {
    const result = prepareTexForMathJax('$$a + $b$ + c$$');
    expect(result.displayMode).toBe(true);
    expect(result.tex).toContain('$b$');
  });

  it('prepareTexForMathJax respects explicit displayMode override', () => {
    const result = prepareTexForMathJax('$inline$', true);
    expect(result.displayMode).toBe(true);
    expect(result.tex).toBe('inline');
  });

  it('normalization preserves mathematical semantics — complex expression unchanged', () => {
    const complex = '\\frac{\\partial^2 f}{\\partial x^2} + \\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}';
    const result = normalizeTexForMathJax(complex);
    expect(result).toBe(complex);
  });
});
