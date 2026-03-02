import { describe, expect, it } from 'vitest';
import { formatTexError } from '@/lib/latex/tex-errors';

describe('formatTexError', () => {
  it('maps unknown control sequence errors', () => {
    const err = new Error('Unknown control sequence \\foo');
    expect(formatTexError(err, 'x')).toBe('Unknown command: \\foo');
  });

  it('maps missing close brace errors', () => {
    const err = new Error('Missing close brace');
    expect(formatTexError(err, 'x')).toBe("Unmatched '{' in expression");
  });

  it('maps double superscript errors', () => {
    const err = new Error('Double superscript');
    expect(formatTexError(err, 'x')).toBe('Double superscript — use {a^b}^c');
  });

  it('maps double subscript errors', () => {
    const err = new Error('Double subscript');
    expect(formatTexError(err, 'x')).toBe('Double subscript — use {a_b}_c');
  });

  it('maps misplaced & errors', () => {
    const err = new Error('Misplaced &');
    expect(formatTexError(err, 'x')).toBe("'&' used outside of table/alignment environment");
  });

  it('falls back to original message for unrecognized errors', () => {
    const err = new Error('Something unexpected');
    expect(formatTexError(err, 'x')).toBe('Something unexpected');
  });

  it('handles non-Error values', () => {
    expect(formatTexError('string error', 'x')).toBe('string error');
    expect(formatTexError(42, 'x')).toBe('Rendering failed');
    expect(formatTexError(null, 'x')).toBe('Rendering failed');
  });
});
