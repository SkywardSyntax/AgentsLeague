import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/server/logger';
import type { z } from 'zod';
import { validateTokenFormat, constantTimeCompare } from '@/lib/security/csrf-protection';

export interface ApiErrorResponse {
  error: string;
  message?: string;
  issues?: Array<{ path: (string | number)[]; message: string }>;
  requestId: string;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  requestId: string,
): Response {
  const body: ApiErrorResponse = { error: code, message, requestId };
  return Response.json(body, {
    status,
    headers: { 'X-Request-Id': requestId },
  });
}

export interface HandlerContext {
  requestId: string;
}

export type Handler = (request: Request, ctx: HandlerContext) => Promise<Response> | Response;
type Middleware = (handler: Handler) => Handler;

export function withRequestId(handler: Handler): Handler {
  return async (request, ctx) => {
    const requestId = ctx.requestId || randomUUID();
    const response = await handler(request, { ...ctx, requestId });
    response.headers.set('X-Request-Id', requestId);
    return response;
  };
}

export function withErrorBoundary(handler: Handler): Handler {
  return async (request, ctx) => {
    const log = createLogger({ requestId: ctx.requestId, route: new URL(request.url).pathname });
    try {
      return await handler(request, ctx);
    } catch (error) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error instanceof Error
            ? error.message
            : 'Internal server error';
      log.error('unhandled_error', { error: error instanceof Error ? error.message : String(error) });
      return apiError(500, 'INTERNAL_ERROR', message, ctx.requestId);
    }
  };
}

export function withValidation<T extends z.ZodType>(
  schema: T,
  handler: (request: Request, ctx: HandlerContext & { data: z.infer<T> }) => Promise<Response> | Response,
): Handler {
  return async (request, ctx) => {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError(400, 'BAD_REQUEST', 'Request body must be JSON', ctx.requestId);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const body: ApiErrorResponse = {
        error: 'VALIDATION_ERROR',
        issues: parsed.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message })),
        requestId: ctx.requestId,
      };
      return Response.json(body, {
        status: 400,
        headers: { 'X-Request-Id': ctx.requestId },
      });
    }
    return handler(request, { ...ctx, data: parsed.data });
  };
}

export function withContentType(expected: string, handler: Handler): Handler {
  return async (request, ctx) => {
    const ct = request.headers.get('Content-Type') ?? '';
    if (!ct.includes(expected)) {
      return apiError(415, 'UNSUPPORTED_MEDIA_TYPE', `Expected Content-Type: ${expected}`, ctx.requestId);
    }
    return handler(request, ctx);
  };
}

export function withBodySizeLimit(maxBytes: number, handler: Handler): Handler {
  return async (request, ctx) => {
    const contentLength = request.headers.get('Content-Length');
    if (contentLength) {
      const len = parseInt(contentLength, 10);
      if (!Number.isNaN(len) && len > maxBytes) {
        return apiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes`, ctx.requestId);
      }
    }

    // When Content-Length is missing (e.g. chunked transfer), read the body
    // with a byte counter to enforce the limit.
    if (!contentLength && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            reader.cancel();
            return apiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes`, ctx.requestId);
          }
          chunks.push(value);
        }
      } catch {
        return apiError(400, 'BAD_REQUEST', 'Failed to read request body', ctx.requestId);
      }
      // Reconstruct the request with the already-read body so downstream can call request.json()
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const newRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: combined,
      });
      return handler(newRequest, ctx);
    }

    return handler(request, ctx);
  };
}

/** Compose middlewares right-to-left: compose(a, b)(handler) = a(b(handler)) */
export function compose(...middlewares: Middleware[]): Middleware {
  return (handler: Handler) => middlewares.reduceRight((h, mw) => mw(h), handler);
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  /** Extract session key from request. Defaults to X-Session-Id header. */
  keyExtractor?: (request: Request) => string | null;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const MAX_KEY_LENGTH = 128;
const MAX_BUCKETS = 10_000;

/** Truncate overly long keys to bound memory per-key. */
function sanitizeKey(raw: string): string {
  if (raw.length <= MAX_KEY_LENGTH) return raw;
  return raw.slice(0, MAX_KEY_LENGTH);
}

/**
 * Sliding-window rate limiter. Configurable via RateLimitConfig.
 * Uses an in-memory Map keyed by session identifier.
 * Caps map size at MAX_BUCKETS and truncates keys to MAX_KEY_LENGTH.
 */
export function withRateLimit(config: RateLimitConfig): Middleware {
  const buckets = new Map<string, RateLimitEntry>();
  const { maxRequests, windowMs, keyExtractor } = config;

  // Periodic eviction to prevent unbounded growth
  const EVICTION_INTERVAL = Math.max(windowMs * 2, 60_000);
  let lastEviction = Date.now();

  function evictExpired(now: number): void {
    if (now - lastEviction < EVICTION_INTERVAL) return;
    lastEviction = now;
    for (const [key, entry] of buckets) {
      if (now >= entry.resetAt) buckets.delete(key);
    }
  }

  return (handler: Handler) => async (request: Request, ctx: HandlerContext) => {
    const extractKey = keyExtractor ?? ((req: Request) => {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || null;
      const sessionId = req.headers.get('X-Session-Id');
      // Combine IP + session ID so rotating session IDs doesn't bypass rate limits
      if (ip && sessionId) return `${ip}:${sessionId}`;
      if (ip) return ip;
      // Dev fallback: use session ID alone when no IP headers are available
      return sessionId;
    });
    const rawKey = extractKey(request);

    // Reject requests without a session key to prevent shared-bucket DoS
    if (!rawKey) {
      return apiError(401, 'SESSION_REQUIRED', 'X-Session-Id header is required', ctx.requestId);
    }

    const sessionKey = sanitizeKey(rawKey);

    const now = Date.now();

    evictExpired(now);

    const entry = buckets.get(sessionKey);
    if (entry && now < entry.resetAt) {
      if (entry.count >= maxRequests) {
        const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
        return new Response(
          JSON.stringify({
            error: 'RATE_LIMITED',
            message: 'Rate limit exceeded. Try again later.',
            requestId: ctx.requestId,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-Id': ctx.requestId,
              'Retry-After': String(retryAfterSec),
            },
          },
        );
      }
      entry.count++;
    } else {
      buckets.set(sessionKey, { count: 1, resetAt: now + windowMs });
    }

    // Force eviction when map grows beyond cap
    if (buckets.size > MAX_BUCKETS) {
      for (const [key, e] of buckets) {
        if (now >= e.resetAt) buckets.delete(key);
      }
    }

    return handler(request, ctx);
  };
}

/**
 * SEC-005: CSRF protection middleware for mutating (POST/PUT/DELETE) endpoints.
 * Uses Origin/Referer validation plus optional double-submit cookie pattern.
 * Fail-closed: requests without a valid Origin or Referer are rejected.
 */
export function withCsrfProtection(allowedOrigins?: string[]): Middleware {
  return (handler: Handler) => async (request: Request, ctx: HandlerContext) => {
    const method = request.method.toUpperCase();
    // Only enforce on state-changing methods
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return handler(request, ctx);
    }

    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');

    // Derive allowed origins from request URL if not explicitly configured
    const requestUrl = new URL(request.url);
    const defaultAllowed = [requestUrl.origin];
    const allowed = allowedOrigins && allowedOrigins.length > 0
      ? allowedOrigins
      : defaultAllowed;

    let originValid = false;

    if (origin) {
      originValid = allowed.includes(origin);
    } else if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        originValid = allowed.includes(refererOrigin);
      } catch {
        originValid = false;
      }
    }
    // If neither Origin nor Referer is present, fail closed
    if (!originValid) {
      const log = createLogger({ requestId: ctx.requestId, route: new URL(request.url).pathname });
      log.warn('csrf_origin_rejected', {
        origin: origin ?? '(none)',
        referer: referer ?? '(none)',
      });
      return apiError(403, 'CSRF_REJECTED', 'Cross-origin request blocked', ctx.requestId);
    }

    // Optional: double-submit cookie validation when csrf-token header is present
    const csrfHeader = request.headers.get('X-CSRF-Token');
    const csrfCookie = parseCookieValue(request.headers.get('Cookie'), 'csrf_token');
    if (csrfHeader && csrfCookie) {
      if (!validateTokenFormat(csrfHeader) || !constantTimeCompare(csrfHeader, csrfCookie)) {
        return apiError(403, 'CSRF_TOKEN_INVALID', 'CSRF token mismatch', ctx.requestId);
      }
    }

    return handler(request, ctx);
  };
}

/** Parse a specific cookie value from a Cookie header string */
function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').find((c) => c.trim().startsWith(`${name}=`));
  return match ? match.split('=')[1]?.trim() ?? null : null;
}

/** Wraps a Next.js route handler with middleware, injecting context. */
export function applyMiddleware(
  middleware: Middleware,
  handler: Handler,
): (request: Request) => Promise<Response> {
  const wrapped = middleware(handler);
  return async (request: Request) => wrapped(request, { requestId: randomUUID() });
}
