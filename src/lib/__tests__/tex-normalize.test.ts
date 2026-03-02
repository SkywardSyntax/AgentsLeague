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

  // --- Iteration 4 tests: \left/\right balancing ---

  it('appends \\right. for unmatched \\left', () => {
    const result = normalizeTexForMathJax('\\left(x+1');
    expect(result).toContain('\\right.');
  });

  it('prepends \\left. for unmatched \\right', () => {
    const result = normalizeTexForMathJax('x+1\\right)');
    expect(result).toContain('\\left.');
    expect(result.indexOf('\\left.')).toBe(0);
  });

  it('does not modify already balanced \\left/\\right', () => {
    const result = normalizeTexForMathJax('\\left(x\\right)');
    expect(result).toBe('\\left(x\\right)');
  });

  it('does not count \\leftarrow as \\left', () => {
    const result = normalizeTexForMathJax('\\leftarrow x');
    expect(result).not.toContain('\\right.');
    expect(result).toBe('\\leftarrow x');
  });

  it('does not count \\leftrightarrow as \\left or \\right', () => {
    const result = normalizeTexForMathJax('\\leftrightarrow');
    expect(result).not.toContain('\\left.');
    expect(result).not.toContain('\\right.');
    expect(result).toBe('\\leftrightarrow');
  });

  it('does not count \\rightarrow as \\right', () => {
    const result = normalizeTexForMathJax('\\rightarrow x');
    expect(result).not.toContain('\\left.');
    expect(result).toBe('\\rightarrow x');
  });

  it('handles $$$$ as single-$ delimiters leaving inner $$', () => {
    const prepared = prepareTexForMathJax('$$$$');
    expect(prepared).toEqual({ tex: '$$', displayMode: false });
  });

  it('returns mismatched delimiters as-is without stripping', () => {
    const prepared = prepareTexForMathJax('\\[content\\)');
    expect(prepared).toEqual({ tex: '\\[content\\)', displayMode: false });
  });

  it('handles whitespace-only content between delimiters', () => {
    const prepared = prepareTexForMathJax('\\[  \\]');
    expect(prepared).toEqual({ tex: '', displayMode: true });
  });

  it('preserves \\text command in inline mode', () => {
    const prepared = prepareTexForMathJax('$\\text{hello}$');
    expect(prepared).toEqual({ tex: '\\text{hello}', displayMode: false });
  });

  it('does not strip \\begin{align} delimiters (only equation supported)', () => {
    const prepared = prepareTexForMathJax('\\begin{align}x+1\\end{align}');
    expect(prepared).toEqual({ tex: '\\begin{align}x+1\\end{align}', displayMode: false });
  });
});
