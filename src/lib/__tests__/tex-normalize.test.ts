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
    const normalized = normalizeTexForMathJax('\\begin{pmatrix}a&b\\\\[4pt]c&d\\end{pmatrix}');
    expect(normalized).toBe('\\begin{pmatrix}a&b\\\\[4pt]c&d\\end{pmatrix}');
  });
});
