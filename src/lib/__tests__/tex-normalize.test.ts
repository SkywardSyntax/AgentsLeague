import { describe, expect, it } from 'vitest';
import { normalizeTexForMathJax, prepareTexForMathJax } from '@/lib/latex/tex-normalize';

describe('tex normalization', () => {
  it('normalizes over-escaped commands', () => {
    const normalized = normalizeTexForMathJax('x=\\\\frac{1}{2}+\\\\sqrt{3}');
    expect(normalized).toBe('x=\\frac{1}{2}+\\sqrt{3}');
  });

  it('strips outer delimiters and resolves display mode', () => {
    const prepared = prepareTexForMathJax('\\[x^2+1\\]');
    expect(prepared).toEqual({ tex: 'x^2+1', displayMode: true });
  });

  it('respects explicit display mode override', () => {
    const prepared = prepareTexForMathJax('\\(x+1\\)', true);
    expect(prepared).toEqual({ tex: 'x+1', displayMode: true });
  });

  it('strips equation environment delimiters', () => {
    const prepared = prepareTexForMathJax('\\begin{equation}x^2+1\\end{equation}');
    expect(prepared).toEqual({ tex: 'x^2+1', displayMode: true });
  });

  it('preserves matrix row spacing commands', () => {
    // pmatrix is now stripped as an outer delimiter, so the inner content is returned
    const normalized = normalizeTexForMathJax('\\begin{pmatrix}a&b\\\\[4pt]c&d\\end{pmatrix}');
    expect(normalized).toBe('a&b\\\\[4pt]c&d');
  });

  // --- Iteration 2 tests ---

  it('preserves row breaks inside environments during over-escape fix', () => {
    // \\\\hline inside an environment is row-break (\\) + \\hline — should not be collapsed
    const normalized = normalizeTexForMathJax('\\begin{pmatrix}a\\\\\\\\hline b\\end{pmatrix}');
    expect(normalized).toContain('\\\\');
    expect(normalized).toContain('\\hline');
  });

  it('fixes deeply over-escaped commands outside environments', () => {
    const normalized = normalizeTexForMathJax('\\\\frac{a}{b}');
    expect(normalized).toBe('\\frac{a}{b}');
  });

  it('strips bmatrix outer delimiters', () => {
    const prepared = prepareTexForMathJax('\\begin{bmatrix}1&2\\end{bmatrix}');
    expect(prepared).toEqual({ tex: '1&2', displayMode: true });
  });

  it('strips vmatrix outer delimiters', () => {
    const prepared = prepareTexForMathJax('\\begin{vmatrix}a&b\\end{vmatrix}');
    expect(prepared).toEqual({ tex: 'a&b', displayMode: true });
  });

  it('strips multline outer delimiters', () => {
    const prepared = prepareTexForMathJax('\\begin{multline}a+b\\end{multline}');
    expect(prepared).toEqual({ tex: 'a+b', displayMode: true });
  });

  it('strips split outer delimiters', () => {
    const prepared = prepareTexForMathJax('\\begin{split}x=1\\end{split}');
    expect(prepared).toEqual({ tex: 'x=1', displayMode: true });
  });
});
