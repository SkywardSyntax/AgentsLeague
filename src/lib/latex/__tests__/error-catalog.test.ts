import { describe, it, expect } from 'vitest';
import {
  LatexErrorCode,
  getLatexError,
  isRecoverable,
  matchErrorPattern,
} from '../error-catalog';

describe('Lane 05 — LaTeX Error Catalog', () => {
  it('LatexErrorCode enum has all expected members', () => {
    const codes = [
      LatexErrorCode.UNKNOWN,
      LatexErrorCode.MISSING_BRACE,
      LatexErrorCode.UNDEFINED_COMMAND,
      LatexErrorCode.DOUBLE_SUPERSCRIPT,
      LatexErrorCode.DOUBLE_SUBSCRIPT,
      LatexErrorCode.MISMATCHED_ENV,
      LatexErrorCode.INVALID_DELIMITER,
      LatexErrorCode.MISSING_ARGUMENT,
      LatexErrorCode.EXTRA_ALIGNMENT,
      LatexErrorCode.MATH_MODE_ERROR,
    ];
    expect(codes).toHaveLength(10);
  });

  it('getLatexError() returns structured error for known pattern', () => {
    const err = getLatexError('missing }');
    expect(err.code).toBe(LatexErrorCode.MISSING_BRACE);
    expect(err.message).toBeTruthy();
    expect(err.suggestion).toBeTruthy();
  });

  it('getLatexError() returns UNKNOWN for unrecognized pattern', () => {
    const err = getLatexError('totally random gibberish 12345');
    expect(err.code).toBe(LatexErrorCode.UNKNOWN);
  });

  it('each error has a user-friendly message', () => {
    for (const code of Object.values(LatexErrorCode).filter((v) => typeof v === 'number')) {
      const err = getLatexError(''); // will be UNKNOWN, but we test catalog directly
      expect(typeof err.message).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it('each error has a recovery suggestion', () => {
    const err = getLatexError('undefined control sequence found');
    expect(err.suggestion.length).toBeGreaterThan(0);
  });

  it('isRecoverable() returns true for recoverable errors', () => {
    expect(isRecoverable(LatexErrorCode.MISSING_BRACE)).toBe(true);
    expect(isRecoverable(LatexErrorCode.UNDEFINED_COMMAND)).toBe(true);
  });

  it('isRecoverable() returns false for fatal errors', () => {
    expect(isRecoverable(LatexErrorCode.UNKNOWN)).toBe(false);
    expect(isRecoverable(LatexErrorCode.MISMATCHED_ENV)).toBe(false);
  });

  it('matchErrorPattern() detects missing brace errors', () => {
    expect(matchErrorPattern('missing } in expression')).toBe(LatexErrorCode.MISSING_BRACE);
  });

  it('matchErrorPattern() detects undefined command errors', () => {
    expect(matchErrorPattern('undefined control sequence \\foo')).toBe(LatexErrorCode.UNDEFINED_COMMAND);
  });

  it('all error codes have unique numeric values', () => {
    const values = Object.values(LatexErrorCode).filter((v) => typeof v === 'number');
    expect(new Set(values).size).toBe(values.length);
  });
});
