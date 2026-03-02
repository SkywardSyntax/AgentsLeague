import { describe, it, expect } from 'vitest';
import { normalizeTexForMathJax, prepareTexForMathJax } from '@/lib/latex/tex-normalize';
import { planSemanticBatch } from '@/lib/whiteboard/planner/templates';
import type { SemanticBatch } from '@/types/agent';

describe('LaTeX↔Planner contract', () => {
  it('simple x^2 equation normalizes without change', () => {
    expect(normalizeTexForMathJax('x^2')).toBe('x^2');
  });

  it('fraction \\frac{a}{b} normalizes correctly', () => {
    const result = normalizeTexForMathJax('\\frac{a}{b}');
    expect(result).toBe('\\frac{a}{b}');
  });

  it('over-escaped \\\\frac is reduced to valid \\frac', () => {
    const result = normalizeTexForMathJax('\\\\frac{a}{b}');
    expect(result).toBe('\\frac{a}{b}');
  });

  it('dollar-delimited $x^2$ strips delimiters', () => {
    const result = normalizeTexForMathJax('$x^2$');
    expect(result).toBe('x^2');
  });

  it('display delimited $$x^2$$ strips delimiters and detects display mode', () => {
    const prepared = prepareTexForMathJax('$$x^2$$');
    expect(prepared.tex).toBe('x^2');
    expect(prepared.displayMode).toBe(true);
  });

  it('\\begin{equation}...\\end{equation} strips correctly', () => {
    const prepared = prepareTexForMathJax('\\begin{equation}E=mc^2\\end{equation}');
    expect(prepared.tex).toBe('E=mc^2');
    expect(prepared.displayMode).toBe(true);
  });

  it('planner equation_stack lines all produce non-empty normalized TeX', () => {
    const semantic: SemanticBatch = {
      batch_id: 'lp-1',
      template: 'equation_derivation_vertical',
      blocks: [{
        id: 'eq1', kind: 'equation_stack',
        lines: [
          { id: 'l1', tex: '\\frac{d}{dx}(x^2) = 2x' },
          { id: 'l2', tex: '\\int_0^1 x\\,dx = \\frac{1}{2}' },
          { id: 'l3', tex: 'a^2 + b^2 = c^2' },
        ],
      }],
    };
    const planned = planSemanticBatch(semantic);
    const latexEls = planned.elements.filter((e) => e.type === 'latex');
    expect(latexEls.length).toBeGreaterThanOrEqual(3);
    for (const el of latexEls) {
      if (el.type === 'latex') {
        const normalized = normalizeTexForMathJax(el.tex);
        expect(normalized.length).toBeGreaterThan(0);
      }
    }
  });

  it('unicode non-breaking spaces are replaced', () => {
    const result = normalizeTexForMathJax('x\u00a0+\u00a0y');
    expect(result).toBe('x + y');
    expect(result).not.toContain('\u00a0');
  });

  it('nested fractions normalize correctly', () => {
    const result = normalizeTexForMathJax('\\frac{\\frac{a}{b}}{c}');
    expect(result).toBe('\\frac{\\frac{a}{b}}{c}');
  });

  it('empty string normalizes to empty without crash', () => {
    const result = normalizeTexForMathJax('');
    expect(result).toBe('');
  });
});
