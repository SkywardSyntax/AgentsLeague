import { describe, expect, it } from 'vitest';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';
import { normalizeTexForMathJax } from '@/lib/latex/tex-normalize';

describe('stream-tex-parser → tex-normalize pipeline', () => {
  it('preserves \\frac and \\int through parse → normalize', () => {
    const input = 'Consider: $$\\frac{d}{dx}\\int_a^x f(t)dt = f(x)$$';
    const segments = parseStreamingLatex(input);

    const latexSegments = segments.filter((s) => s.kind === 'latex');
    expect(latexSegments.length).toBeGreaterThanOrEqual(1);

    const displaySeg = latexSegments.find((s) => s.display);
    expect(displaySeg).toBeDefined();
    expect(displaySeg!.value).toContain('\\frac');
    expect(displaySeg!.value).toContain('\\int');
    // Verify no double-escaping
    expect(displaySeg!.value).not.toContain('\\\\frac');
    expect(displaySeg!.value).not.toContain('\\\\int');
  });

  it('preserves \\\\ row breaks inside aligned environments', () => {
    const input = '$$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}$$';
    const segments = parseStreamingLatex(input);

    const latexSegments = segments.filter((s) => s.kind === 'latex');
    expect(latexSegments.length).toBeGreaterThanOrEqual(1);

    const displaySeg = latexSegments.find((s) => s.display);
    expect(displaySeg).toBeDefined();
    // Row separators must be preserved (not collapsed to single \)
    expect(displaySeg!.value).toContain('\\\\');
    expect(displaySeg!.value).toContain('\\begin{aligned}');
    expect(displaySeg!.value).toContain('\\end{aligned}');
  });

  it('correctly flags displayMode for mixed inline and display math', () => {
    const input = 'Inline $x^2$ and display $$\\sum_{i=1}^n i$$';
    const segments = parseStreamingLatex(input);

    const latexSegments = segments.filter((s) => s.kind === 'latex');
    expect(latexSegments.length).toBeGreaterThanOrEqual(2);

    const inlineSeg = latexSegments.find((s) => !s.display);
    const displaySeg = latexSegments.find((s) => s.display);

    expect(inlineSeg).toBeDefined();
    expect(inlineSeg!.value).toContain('x^2');

    expect(displaySeg).toBeDefined();
    expect(displaySeg!.value).toContain('\\sum');
    // No content loss
    expect(displaySeg!.value).toMatch(/i/);
  });

  it('corrects over-escaped \\\\frac from LLM output', () => {
    const input = '$$\\\\frac{a}{b}$$';
    const segments = parseStreamingLatex(input);

    const latexSegments = segments.filter((s) => s.kind === 'latex');
    expect(latexSegments.length).toBeGreaterThanOrEqual(1);

    const seg = latexSegments[0]!;
    // The over-escaped \\frac should be normalized to \frac
    expect(seg.value).toContain('\\frac');
    expect(seg.value).not.toContain('\\\\frac');
  });

  it('normalizeTexForMathJax alone fixes over-escaped commands', () => {
    const result = normalizeTexForMathJax('\\\\frac{a}{b} + \\\\sqrt{c}');
    expect(result).toContain('\\frac');
    expect(result).toContain('\\sqrt');
    expect(result).not.toContain('\\\\frac');
    expect(result).not.toContain('\\\\sqrt');
  });

  it('normalizeTexForMathJax preserves \\\\ inside environments', () => {
    const input = '\\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}';
    const result = normalizeTexForMathJax(input);
    expect(result).toContain('\\\\');
    expect(result).toContain('\\begin{aligned}');
  });
});
