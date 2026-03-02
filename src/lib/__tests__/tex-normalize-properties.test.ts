import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { normalizeTexForMathJax, prepareTexForMathJax } from '@/lib/latex/tex-normalize';

describe('tex normalization — property-based', () => {
  it('normalizeTexForMathJax is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
        const once = normalizeTexForMathJax(input);
        const twice = normalizeTexForMathJax(once);
        expect(twice).toBe(once);
      }),
    );
  });

  it('normalizeTexForMathJax removes all non-breaking spaces', () => {
    const arbWithNbsp = fc.array(
      fc.constantFrom('\u00a0', ' ', '\\frac{1}{2}', 'x', '+', 'abc'),
      { minLength: 0, maxLength: 30 },
    ).map((parts) => parts.join(''));

    fc.assert(
      fc.property(arbWithNbsp, (input) => {
        const result = normalizeTexForMathJax(input);
        expect(result).not.toContain('\u00a0');
      }),
    );
  });

  it('normalizeTexForMathJax produces no leading/trailing whitespace', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (input) => {
        const result = normalizeTexForMathJax(input);
        expect(result).toBe(result.trim());
      }),
    );
  });

  it('prepareTexForMathJax displayMode is always boolean', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (input) => {
        const result = prepareTexForMathJax(input);
        expect(typeof result.displayMode).toBe('boolean');
      }),
    );
  });

  it('prepareTexForMathJax explicit displayMode override always wins', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.boolean(),
        (input, displayMode) => {
          const result = prepareTexForMathJax(input, displayMode);
          expect(result.displayMode).toBe(displayMode);
        },
      ),
    );
  });
});
