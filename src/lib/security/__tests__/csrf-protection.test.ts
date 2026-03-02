import { describe, it, expect } from 'vitest';
import {
  generateTokenString,
  createCsrfToken,
  constantTimeCompare,
  validateTokenFormat,
  validateCsrfToken,
  isTokenExpired,
  rotateToken,
  createDoubleSubmitPair,
} from '../csrf-protection';

describe('csrf-protection', () => {
  describe('generateTokenString', () => {
    it('generates token of requested length', () => {
      const token = generateTokenString(32);
      expect(token).toHaveLength(32);
    });

    it('generates only alphanumeric characters', () => {
      const token = generateTokenString(64);
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('generates unique tokens', () => {
      const a = generateTokenString();
      const b = generateTokenString();
      expect(a).not.toBe(b);
    });
  });

  describe('createCsrfToken', () => {
    it('creates token with correct expiry', () => {
      const before = Date.now();
      const token = createCsrfToken(60_000);
      expect(token.expiresAt).toBeGreaterThanOrEqual(before + 60_000);
      expect(token.token).toHaveLength(32);
    });
  });

  describe('constantTimeCompare', () => {
    it('returns true for matching strings', () => {
      expect(constantTimeCompare('abc', 'abc')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(constantTimeCompare('abc', 'abd')).toBe(false);
    });

    it('returns false for different lengths', () => {
      expect(constantTimeCompare('abc', 'abcd')).toBe(false);
    });
  });

  describe('validateTokenFormat', () => {
    it('accepts valid token format', () => {
      expect(validateTokenFormat('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef')).toBe(true);
    });

    it('rejects non-string', () => {
      expect(validateTokenFormat(123 as unknown as string)).toBe(false);
    });

    it('rejects tokens with special characters', () => {
      expect(validateTokenFormat('abc!@#def')).toBe(false);
    });

    it('rejects too-short tokens', () => {
      expect(validateTokenFormat('abc')).toBe(false);
    });
  });

  describe('validateCsrfToken', () => {
    it('validates correct token', () => {
      const token = createCsrfToken(60_000);
      const result = validateCsrfToken(token.token, token);
      expect(result.valid).toBe(true);
    });

    it('rejects expired token', () => {
      const token = createCsrfToken(1_000);
      const result = validateCsrfToken(token.token, token, Date.now() + 2_000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('rejects mismatched token', () => {
      const token = createCsrfToken(60_000);
      const result = validateCsrfToken('WrongTokenValueThatIsLongEnough00', token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('mismatch');
    });
  });

  describe('isTokenExpired', () => {
    it('returns false for future expiry', () => {
      const token = createCsrfToken(60_000);
      expect(isTokenExpired(token)).toBe(false);
    });

    it('returns true for past expiry', () => {
      const token = createCsrfToken(1);
      expect(isTokenExpired(token, Date.now() + 1_000)).toBe(true);
    });
  });

  describe('rotateToken', () => {
    it('does not rotate fresh token', () => {
      const token = createCsrfToken(60_000);
      const result = rotateToken(token, 60_000, token.createdAt + 1_000);
      expect(result.shouldRotate).toBe(false);
      expect(result.newToken.token).toBe(token.token);
    });

    it('rotates token past half-life', () => {
      const token = createCsrfToken(60_000);
      const result = rotateToken(token, 60_000, token.createdAt + 40_000);
      expect(result.shouldRotate).toBe(true);
      expect(result.newToken.token).not.toBe(token.token);
    });
  });

  describe('createDoubleSubmitPair', () => {
    it('creates matching cookie and header tokens', () => {
      const pair = createDoubleSubmitPair();
      expect(pair.cookieToken).toBe(pair.headerToken);
      expect(pair.cookieToken.length).toBeGreaterThan(0);
      expect(pair.expiresAt).toBeGreaterThan(Date.now());
    });
  });
});
