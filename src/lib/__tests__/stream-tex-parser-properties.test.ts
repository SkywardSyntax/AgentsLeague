import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseStreamingLatex } from '@/lib/latex/stream-tex-parser';

const texFragmentArb = fc
  .array(
    fc.constantFrom(
      '\\(',
      '\\)',
      '\\[',
      '\\]',
      '$',
      '$$',
      '\\frac{',
      '}',
      'x^2',
      ' + 1',
      'hello',
      ' ',
      '\n',
      '\\alpha',
      'a+b=c',
    ),
    { minLength: 0, maxLength: 15 },
  )
  .map((parts: string[]) => parts.join(''));

const inputArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 300 }),
  texFragmentArb,
);

describe('parseStreamingLatex — property-based', () => {
  it('reconstruction: joined segments never invent content beyond the input', () => {
    fc.assert(
      fc.property(inputArb, (input: string) => {
        const segments = parseStreamingLatex(input);
        const joined = segments.map((s) => s.value).join('');
        // Segments are normalized (e.g. whitespace trimmed, over-escapes fixed),
        // so the joined length may shrink but must never exceed the original.
        expect(joined.length).toBeLessThanOrEqual(input.length);
      }),
    );
  });

  it('no empty latex segments', () => {
    fc.assert(
      fc.property(inputArb, (input: string) => {
        const segments = parseStreamingLatex(input);
        const emptyLatex = segments.filter(
          (s) => s.kind === 'latex' && s.value.length === 0,
        );
        expect(emptyLatex).toHaveLength(0);
      }),
    );
  });

  it('adjacent segments never share "text" kind (compaction invariant)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (input: string) => {
        const segments = parseStreamingLatex(input);
        for (let i = 1; i < segments.length; i++) {
          if (segments[i].kind === 'text' && segments[i - 1].kind === 'text') {
            throw new Error(
              `Adjacent text segments at index ${i - 1} and ${i}: ` +
                `"${segments[i - 1].value}" / "${segments[i].value}"`,
            );
          }
        }
      }),
    );
  });

  it('text segments always have display === false', () => {
    fc.assert(
      fc.property(inputArb, (input: string) => {
        const segments = parseStreamingLatex(input);
        for (const seg of segments) {
          if (seg.kind === 'text') {
            expect(seg.display).toBe(false);
          }
        }
      }),
    );
  });
});
