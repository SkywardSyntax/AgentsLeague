/**
 * API authentication utilities — session validation, token verification,
 * and permission checking for API route protection.
 */

const TOKEN_PARTS = 3; // header.payload.signature
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 4096;
const MIN_TOKEN_LENGTH = 10;

export interface TokenPayload {
  sub: string;
  exp: number;
  iat: number;
  scopes: string[];
  [key: string]: unknown;
}

export interface TokenValidationResult {
  valid: boolean;
  payload: TokenPayload | null;
  error?: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  missing: string[];
}

/**
 * Validate JWT-like token structure (does NOT verify cryptographic signature —
 * that requires server-side secrets). Checks format, expiry, and required fields.
 */
export function validateTokenStructure(token: string): TokenValidationResult {
  if (typeof token !== 'string') {
    return { valid: false, payload: null, error: 'Token must be a string' };
  }

  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    return { valid: false, payload: null, error: 'Token length out of bounds' };
  }

  const parts = token.split('.');
  if (parts.length !== TOKEN_PARTS) {
    return { valid: false, payload: null, error: 'Token must have exactly 3 parts (header.payload.signature)' };
  }

  for (let i = 0; i < parts.length; i++) {
    if (!BASE64URL_RE.test(parts[i]!)) {
      return { valid: false, payload: null, error: `Token part ${i} contains invalid characters` };
    }
  }

  // Decode payload (middle part)
  let payload: TokenPayload;
  try {
    const decoded = atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'));
    payload = JSON.parse(decoded) as TokenPayload;
  } catch {
    return { valid: false, payload: null, error: 'Failed to decode token payload' };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, payload: null, error: 'Token payload is not an object' };
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return { valid: false, payload: null, error: 'Token payload missing "sub" claim' };
  }

  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { valid: false, payload: null, error: 'Token payload missing valid "exp" claim' };
  }

  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) {
    return { valid: false, payload: null, error: 'Token payload missing valid "iat" claim' };
  }

  if (!Array.isArray(payload.scopes)) {
    payload.scopes = [];
  }

  return { valid: true, payload };
}

export function isTokenExpired(payload: TokenPayload, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  return nowSeconds >= payload.exp;
}

export function checkPermissions(
  userScopes: string[],
  requiredScopes: string[],
): PermissionCheckResult {
  const scopeSet = new Set(userScopes);
  const missing = requiredScopes.filter((s) => !scopeSet.has(s));
  return { allowed: missing.length === 0, missing };
}

export function validateSession(
  token: string,
  requiredScopes: string[] = [],
  nowSeconds: number = Math.floor(Date.now() / 1000),
): { valid: boolean; payload: TokenPayload | null; error?: string } {
  const structureResult = validateTokenStructure(token);
  if (!structureResult.valid || !structureResult.payload) {
    return structureResult;
  }

  if (isTokenExpired(structureResult.payload, nowSeconds)) {
    return { valid: false, payload: structureResult.payload, error: 'Token has expired' };
  }

  if (requiredScopes.length > 0) {
    const permResult = checkPermissions(structureResult.payload.scopes, requiredScopes);
    if (!permResult.allowed) {
      return {
        valid: false,
        payload: structureResult.payload,
        error: `Missing required scopes: ${permResult.missing.join(', ')}`,
      };
    }
  }

  return { valid: true, payload: structureResult.payload };
}

export function extractBearerToken(authHeader: string): string | null {
  if (typeof authHeader !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  return match ? match[1]! : null;
}

export function createMockToken(payload: TokenPayload): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = btoa('mock-signature')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${body}.${sig}`;
}
