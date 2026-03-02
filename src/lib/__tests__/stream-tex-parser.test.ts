import { describe, expect, it } from 'vitest';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';

describe('parseStreamingLatex', () => {
  it('parses inline and block math delimiters used by model output', () => {
    const parsed = parseStreamingLatex(
      'Inline \\(x^2+1\\), block: \\[\\frac{a}{b}\\], dollar $c+d$.',
    );

    const latexSegments = parsed.filter((segment) => segment.kind === 'latex');
    expect(latexSegments).toHaveLength(3);
    expect(latexSegments[0]).toMatchObject({ kind: 'latex', value: 'x^2+1', display: false });
    expect(latexSegments[1]).toMatchObject({ kind: 'latex', value: '\\frac{a}{b}', display: true });
    expect(latexSegments[2]).toMatchObject({ kind: 'latex', value: 'c+d', display: false });
  });

  it('keeps unmatched delimiters as text during streaming', () => {
    const parsed = parseStreamingLatex('still typing: \\[x^2 +');
    expect(parsed).toEqual([{ kind: 'text', value: 'still typing: \\[x^2 +', display: false }]);
  });

  it('handles over-escaped delimiters and commands', () => {
    const parsed = parseStreamingLatex('\\\\[x=\\\\frac{1}{2}\\\\]');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      kind: 'latex',
      value: 'x=\\frac{1}{2}',
      display: true,
    });
  });

  it('parses chemistry delimiters from OpenWebUI-style rules', () => {
    const parsed = parseStreamingLatex('Combustion: \\ce{2H2 + O2 -> 2H2O}');
    const latex = parsed.find((segment) => segment.kind === 'latex');
    expect(latex).toMatchObject({
      kind: 'latex',
      value: '2H2 + O2 -> 2H2O',
      display: false,
    });
  });

  it('treats standalone equation lines as implicit latex', () => {
    const parsed = parseStreamingLatex('Step:\nx^2+\\frac{b}{a}x+\\frac{c}{a}=0\nDone');
    const latex = parsed.filter((segment) => segment.kind === 'latex');
    expect(latex).toHaveLength(1);
    expect(latex[0]).toMatchObject({
      kind: 'latex',
      value: 'x^2+\\frac{b}{a}x+\\frac{c}{a}=0',
      display: true,
    });
  });

  it('splits inline undelimited latex commands out of prose', () => {
    const parsed = parseStreamingLatex('Start with the general quadratic (with a\\neq 0):');
    const latex = parsed.find((segment) => segment.kind === 'latex');
    expect(latex).toMatchObject({
      kind: 'latex',
      value: 'a\\neq 0',
      display: false,
    });
  });

  it('does not promote prose-heavy lines into full implicit latex', () => {
    const parsed = parseStreamingLatex('Complete the square and add \\frac{b}{2a} to both sides.');
    const latexSegments = parsed.filter((segment) => segment.kind === 'latex');
    const textSegments = parsed.filter((segment) => segment.kind === 'text');
    expect(latexSegments).toHaveLength(1);
    expect(latexSegments[0]).toMatchObject({
      kind: 'latex',
      value: '\\frac{b}{2a}',
      display: false,
    });
    expect(textSegments.some((segment) => segment.value.includes('Complete the square'))).toBe(true);
  });

  it('extracts inline caret scripts into latex segments', () => {
    const parsed = parseStreamingLatex('Solve for u^3 and v^3');
    const latexSegments = parsed.filter((segment) => segment.kind === 'latex');

    expect(latexSegments).toHaveLength(2);
    expect(latexSegments[0]).toMatchObject({ kind: 'latex', value: 'u^3', display: false });
    expect(latexSegments[1]).toMatchObject({ kind: 'latex', value: 'v^3', display: false });
  });

  it('does not misread matrix row spacing as display delimiter start', () => {
    const parsed = parseStreamingLatex('J=\\begin{pmatrix}a&b\\\\[4pt]c&d\\end{pmatrix}');
    const latexSegments = parsed.filter((segment) => segment.kind === 'latex');
    expect(latexSegments).toHaveLength(1);
    expect(latexSegments[0]).toMatchObject({
      kind: 'latex',
      value: 'J=\\begin{pmatrix}a&b\\\\[4pt]c&d\\end{pmatrix}',
      display: true,
    });
  });

  it('merges overlapping inline detections into one latex segment', () => {
    const parsed = parseStreamingLatex('x^2+\\frac{b}{a}');
    const latexSegments = parsed.filter((segment) => segment.kind === 'latex');
    expect(latexSegments).toHaveLength(1);
    expect(latexSegments[0]).toMatchObject({
      kind: 'latex',
      value: 'x^2+\\frac{b}{a}',
      display: true,
    });
  });
});
