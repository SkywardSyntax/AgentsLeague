import { describe, expect, it } from 'vitest';
import { formatTexError, isTimeoutError } from '@/lib/latex/tex-errors';
import { RenderTimeoutError } from '@/lib/latex/mathjax-client';

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

  it('maps timeout errors', () => {
    const err = new RenderTimeoutError(5000);
    expect(formatTexError(err, 'x')).toBe(
      'Rendering timed out (5s) — expression may be too complex',
    );
  });

  it('maps max length errors', () => {
    const err = new Error('TeX input exceeds maximum length of 10000 characters');
    expect(formatTexError(err, 'x')).toBe('Expression too long to render');
  });

  // --- Iteration 4 tests: additional error patterns ---

  it('maps Extra open brace errors', () => {
    const err = new Error('Extra open brace');
    expect(formatTexError(err, 'x')).toBe("Extra '{' found");
  });

  it('maps Undefined control sequence errors', () => {
    const err = new Error('Undefined control sequence \\foo');
    expect(formatTexError(err, 'x')).toBe('Unknown command: \\foo');
  });

  it('maps Missing \\right errors', () => {
    const err = new Error('Missing \\right');
    expect(formatTexError(err, 'x')).toBe('Unmatched \\left delimiter');
  });

  it('maps Missing \\left errors', () => {
    const err = new Error('Missing \\left');
    expect(formatTexError(err, 'x')).toBe('Unmatched \\right delimiter');
  });
});

describe('isTimeoutError', () => {
  it('detects RenderTimeoutError instances', () => {
    expect(isTimeoutError(new RenderTimeoutError(5000))).toBe(true);
  });

  it('detects timeout errors by message', () => {
    expect(isTimeoutError(new Error('TeX rendering timed out after 5000ms'))).toBe(true);
  });

  it('returns false for non-timeout errors', () => {
    expect(isTimeoutError(new Error('Missing close brace'))).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError('some string')).toBe(false);
  });
});
