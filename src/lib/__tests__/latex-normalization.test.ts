import { describe, expect, it } from 'vitest';
import { normalizeTexForMathJax } from '@/lib/latex/tex-normalize';

describe('normalizeTexForMathJax', () => {
  it('normalizes non-breaking spaces to regular spaces', () => {
    const result = normalizeTexForMathJax('x\u00a0+\u00a0y');
    expect(result).toBe('x + y');
    expect(result).not.toContain('\u00a0');
  });

  it('fixes over-escaped backslash commands', () => {
    const result = normalizeTexForMathJax('\\\\frac{a}{b}');
    expect(result).toBe('\\frac{a}{b}');
  });

  it('preserves double-backslash inside \\begin..\\end blocks', () => {
    const result = normalizeTexForMathJax('\\begin{aligned} a \\\\ b \\end{aligned}');
    expect(result).toContain('\\\\');
    expect(result).toContain('\\begin{aligned}');
    expect(result).toContain('\\end{aligned}');
  });

  it('balances unmatched \\left with \\right.', () => {
    const result = normalizeTexForMathJax('\\left( x + y');
    expect(result).toContain('\\left(');
    expect(result).toContain('\\right.');
  });

  it('does not mistake \\leftarrow for \\left delimiter', () => {
    const result = normalizeTexForMathJax('\\leftarrow x');
    expect(result).toBe('\\leftarrow x');
    expect(result).not.toContain('\\right.');
  });

  it('handles empty string input', () => {
    const result = normalizeTexForMathJax('');
    expect(result).toBe('');
  });
});
