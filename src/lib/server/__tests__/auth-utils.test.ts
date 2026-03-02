import { describe, it, expect } from 'vitest';
import {
  validateTokenStructure,
  isTokenExpired,
  checkPermissions,
  validateSession,
  extractBearerToken,
  createMockToken,
} from '../auth-utils';
import type { TokenPayload } from '../auth-utils';

function makePayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    sub: 'user-123',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    scopes: ['read', 'write'],
    ...overrides,
  };
}

describe('auth-utils', () => {
  describe('validateTokenStructure', () => {
    it('validates a well-formed token', () => {
      const token = createMockToken(makePayload());
      const result = validateTokenStructure(token);
      expect(result.valid).toBe(true);
      expect(result.payload!.sub).toBe('user-123');
    });

    it('rejects non-string token', () => {
      const result = validateTokenStructure(123 as unknown as string);
      expect(result.valid).toBe(false);
    });

    it('rejects token with wrong number of parts', () => {
      const result = validateTokenStructure('only.twoparts');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('3 parts');
    });

    it('rejects token with missing sub claim', () => {
      const token = createMockToken({ ...makePayload(), sub: '' });
      const result = validateTokenStructure(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sub');
    });

    it('rejects too-short tokens', () => {
      const result = validateTokenStructure('abc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('length');
    });
  });

  describe('isTokenExpired', () => {
    it('returns false for valid token', () => {
      const payload = makePayload({ exp: Math.floor(Date.now() / 1000) + 3600 });
      expect(isTokenExpired(payload)).toBe(false);
    });

    it('returns true for expired token', () => {
      const payload = makePayload({ exp: Math.floor(Date.now() / 1000) - 100 });
      expect(isTokenExpired(payload)).toBe(true);
    });
  });

  describe('checkPermissions', () => {
    it('allows when all scopes present', () => {
      const result = checkPermissions(['read', 'write', 'admin'], ['read', 'write']);
      expect(result.allowed).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('denies when scopes missing', () => {
      const result = checkPermissions(['read'], ['read', 'admin']);
      expect(result.allowed).toBe(false);
      expect(result.missing).toContain('admin');
    });
  });

  describe('validateSession', () => {
    it('validates complete session', () => {
      const token = createMockToken(makePayload());
      const result = validateSession(token);
      expect(result.valid).toBe(true);
    });

    it('rejects expired session', () => {
      const token = createMockToken(makePayload({ exp: 1000 }));
      const result = validateSession(token, [], Math.floor(Date.now() / 1000));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('rejects insufficient scopes', () => {
      const token = createMockToken(makePayload({ scopes: ['read'] }));
      const result = validateSession(token, ['admin']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required scopes');
    });
  });

  describe('extractBearerToken', () => {
    it('extracts token from Bearer header', () => {
      expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    });

    it('returns null for invalid header', () => {
      expect(extractBearerToken('Basic abc123')).toBeNull();
    });

    it('returns null for non-string', () => {
      expect(extractBearerToken(123 as unknown as string)).toBeNull();
    });
  });

  describe('createMockToken', () => {
    it('creates valid 3-part token', () => {
      const token = createMockToken(makePayload());
      expect(token.split('.')).toHaveLength(3);
    });
  });
});
