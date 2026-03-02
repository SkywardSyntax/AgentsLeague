import { describe, expect, it } from 'vitest';
import {
  normalizeTexForMathJax,
  prepareTexForMathJax,
} from '@/lib/latex/tex-normalize';

describe('tex-normalize edge cases', () => {
  describe('stripOuterDelimiters (via normalizeTexForMathJax)', () => {
    it('strips \\begin{equation}...\\end{equation} and normalizes', () => {
      const result = normalizeTexForMathJax('\\begin{equation}x^2\\end{equation}');
      expect(result).toBe('x^2');
    });

    it('strips $$ display delimiters', () => {
      const result = normalizeTexForMathJax('$$\\frac{1}{2}$$');
      expect(result).toBe('\\frac{1}{2}');
    });

    it('strips \\[ ... \\] display delimiters', () => {
      const result = normalizeTexForMathJax('\\[a + b\\]');
      expect(result).toBe('a + b');
    });

    it('strips \\( ... \\) inline delimiters', () => {
      const result = normalizeTexForMathJax('\\(x + 1\\)');
      expect(result).toBe('x + 1');
    });

    it('strips single $ inline delimiters', () => {
      const result = normalizeTexForMathJax('$y = mx + b$');
      expect(result).toBe('y = mx + b');
    });

    it('passes through content without delimiters', () => {
      const result = normalizeTexForMathJax('a + b');
      expect(result).toBe('a + b');
    });
  });

  describe('normalizeTexForMathJax', () => {
    it('replaces non-breaking spaces with regular spaces', () => {
      const result = normalizeTexForMathJax('a\u00a0+\u00a0b');
      expect(result).toBe('a + b');
    });

    it('converts over-escaped commands (\\\\frac → \\frac)', () => {
      const result = normalizeTexForMathJax('\\\\frac{1}{2} + \\\\sqrt{3}');
      expect(result).toBe('\\frac{1}{2} + \\sqrt{3}');
    });

    it('returns empty string for whitespace-only input', () => {
      const result = normalizeTexForMathJax('   ');
      expect(result).toBe('');
    });
  });

  describe('prepareTexForMathJax', () => {
    it('uses explicit displayMode when provided', () => {
      const result = prepareTexForMathJax('$x$', true);
      expect(result.displayMode).toBe(true);
    });

    it('infers displayMode from $$ delimiters when not provided', () => {
      const result = prepareTexForMathJax('$$x$$');
      expect(result.displayMode).toBe(true);
      expect(result.tex).toBe('x');
    });

    it('infers inline mode from $ delimiters when not provided', () => {
      const result = prepareTexForMathJax('$x$');
      expect(result.displayMode).toBe(false);
    });

    it('defaults to displayMode false when no delimiters and no override', () => {
      const result = prepareTexForMathJax('x^2');
      expect(result.displayMode).toBe(false);
    });

    it('returns empty tex for empty input', () => {
      const result = prepareTexForMathJax('');
      expect(result.tex).toBe('');
      expect(result.displayMode).toBe(false);
    });

    it('normalizes nested content after stripping delimiters', () => {
      const result = prepareTexForMathJax('$$\\\\frac{1}{2}$$');
      expect(result.tex).toBe('\\frac{1}{2}');
      expect(result.displayMode).toBe(true);
    });
  });
});
