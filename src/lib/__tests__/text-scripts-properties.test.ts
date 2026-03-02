import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseTextScripts } from '../latex/text-scripts';

describe('parseTextScripts — property-based', () => {
  it('non-empty input produces non-empty output', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (input: string) => {
        const tokens = parseTextScripts(input);
        expect(tokens.length).toBeGreaterThan(0);
      }),
    );
  });

  it('empty input produces empty output', () => {
    expect(parseTextScripts('')).toHaveLength(0);
  });

  it('token kinds are always valid', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (input: string) => {
        const tokens = parseTextScripts(input);
        for (const t of tokens) {
          expect(['text', 'sup', 'sub']).toContain(t.kind);
        }
      }),
    );
  });

  it('no empty token values for structured inputs', () => {
    const structuredArb = fc
      .array(
        fc.constantFrom('x', 'y', '^', '_', '{2}', '\\^', '\\_', 'abc'),
        { minLength: 1, maxLength: 20 },
      )
      .map((parts: string[]) => parts.join(''));

    fc.assert(
      fc.property(structuredArb, (input: string) => {
        const tokens = parseTextScripts(input);
        for (const t of tokens) {
          expect(t.value.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});
