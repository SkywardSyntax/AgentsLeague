/**
 * CSRF protection utilities — CSRF token generation and validation.
 * Uses crypto.randomUUID when available, falls back to Math.random-based generation.
 */

const TOKEN_LENGTH = 32;
const TOKEN_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_FORMAT_RE = /^[A-Za-z0-9]{32,128}$/;
const DEFAULT_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface CsrfToken {
  token: string;
  createdAt: number;
  expiresAt: number;
}

export interface CsrfValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Generate a random token string. Uses crypto API if available.
 */
export function generateTokenString(length: number = TOKEN_LENGTH): string {
  const chars: string[] = [];

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      chars.push(TOKEN_CHARSET[values[i]! % TOKEN_CHARSET.length]!);
    }
  } else {
    for (let i = 0; i < length; i++) {
      chars.push(TOKEN_CHARSET[Math.floor(Math.random() * TOKEN_CHARSET.length)]!);
    }
  }

  return chars.join('');
}

export function createCsrfToken(ttlMs: number = DEFAULT_TOKEN_TTL_MS): CsrfToken {
  const now = Date.now();
  return {
    token: generateTokenString(),
    createdAt: now,
    expiresAt: now + ttlMs,
  };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function validateTokenFormat(token: string): boolean {
  if (typeof token !== 'string') return false;
  return TOKEN_FORMAT_RE.test(token);
}

export function validateCsrfToken(
  submitted: string,
  stored: CsrfToken,
  now: number = Date.now(),
): CsrfValidationResult {
  if (!validateTokenFormat(submitted)) {
    return { valid: false, error: 'Invalid token format' };
  }

  if (now > stored.expiresAt) {
    return { valid: false, error: 'Token has expired' };
  }

  if (!constantTimeCompare(submitted, stored.token)) {
    return { valid: false, error: 'Token mismatch' };
  }

  return { valid: true };
}

export function isTokenExpired(token: CsrfToken, now: number = Date.now()): boolean {
  return now > token.expiresAt;
}

export function rotateToken(
  current: CsrfToken,
  ttlMs: number = DEFAULT_TOKEN_TTL_MS,
  now: number = Date.now(),
): { newToken: CsrfToken; shouldRotate: boolean } {
  const halfLife = (current.expiresAt - current.createdAt) / 2;
  const shouldRotate = now > current.createdAt + halfLife;

  return {
    newToken: shouldRotate ? createCsrfToken(ttlMs) : current,
    shouldRotate,
  };
}

export function createDoubleSubmitPair(ttlMs: number = DEFAULT_TOKEN_TTL_MS): {
  cookieToken: string;
  headerToken: string;
  expiresAt: number;
} {
  const token = generateTokenString(TOKEN_LENGTH);
  const now = Date.now();
  return {
    cookieToken: token,
    headerToken: token,
    expiresAt: now + ttlMs,
  };
}
