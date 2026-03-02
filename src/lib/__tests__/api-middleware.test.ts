import { describe, it, expect, vi } from 'vitest';
import {
  apiError,
  withRequestId,
  withErrorBoundary,
  withValidation,
  withBodySizeLimit,
  withContentType,
  withRateLimit,
  compose,
  applyMiddleware,
} from '@/lib/server/api-middleware';
import type { HandlerContext } from '@/lib/server/api-middleware';
import { z } from 'zod';

function makeRequest(body?: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const ctx: HandlerContext = { requestId: 'test-req-id' };

describe('apiError', () => {
  it('returns JSON response with correct status and headers', async () => {
    const res = apiError(400, 'BAD_REQUEST', 'Invalid input', 'req-1');
    expect(res.status).toBe(400);
    expect(res.headers.get('X-Request-Id')).toBe('req-1');
    const body = await res.json();
    expect(body.error).toBe('BAD_REQUEST');
    expect(body.message).toBe('Invalid input');
  });
});

describe('withRequestId', () => {
  it('sets X-Request-Id header on response', async () => {
    const handler = withRequestId(async (_req, c) => {
      return Response.json({ id: c.requestId });
    });
    const res = await handler(makeRequest(), ctx);
    expect(res.headers.get('X-Request-Id')).toBe('test-req-id');
  });
});

describe('withErrorBoundary', () => {
  it('returns 500 on thrown error', async () => {
    const handler = withErrorBoundary(async () => {
      throw new Error('boom');
    });
    const res = await handler(makeRequest(), ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('passes through successful responses', async () => {
    const handler = withErrorBoundary(async () => Response.json({ ok: true }));
    const res = await handler(makeRequest(), ctx);
    expect(res.status).toBe(200);
  });
});

describe('withValidation', () => {
  const schema = z.object({ name: z.string() });

  it('passes parsed data to handler on valid input', async () => {
    const handler = withValidation(schema, async (_req, c) => {
      return Response.json({ greeting: `Hello ${c.data.name}` });
    });
    const res = await handler(makeRequest({ name: 'World' }), ctx);
    const body = await res.json();
    expect(body.greeting).toBe('Hello World');
  });

  it('returns 400 on validation failure', async () => {
    const handler = withValidation(schema, async () => Response.json({}));
    const res = await handler(makeRequest({ age: 10 }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.issues).toBeDefined();
  });

  it('returns 400 on non-JSON body', async () => {
    const handler = withValidation(schema, async () => Response.json({}));
    const req = new Request('http://localhost/test', { method: 'POST', body: 'not json' });
    const res = await handler(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('BAD_REQUEST');
  });
});

describe('withBodySizeLimit', () => {
  it('rejects oversized requests', async () => {
    const handler = withBodySizeLimit(10, async () => Response.json({ ok: true }));
    const res = await handler(makeRequest({ data: 'x'.repeat(100) }, { 'Content-Length': '500' }), ctx);
    expect(res.status).toBe(413);
  });

  it('allows requests within limit', async () => {
    const handler = withBodySizeLimit(10000, async () => Response.json({ ok: true }));
    const res = await handler(makeRequest({ data: 'small' }, { 'Content-Length': '20' }), ctx);
    expect(res.status).toBe(200);
  });
});

describe('compose', () => {
  it('composes middlewares right-to-left', async () => {
    const order: string[] = [];
    const mw1 = (h: any) => async (req: any, c: any) => { order.push('mw1-before'); const r = await h(req, c); order.push('mw1-after'); return r; };
    const mw2 = (h: any) => async (req: any, c: any) => { order.push('mw2-before'); const r = await h(req, c); order.push('mw2-after'); return r; };
    const composed = compose(mw1, mw2)(async () => { order.push('handler'); return Response.json({}); });
    await composed(makeRequest(), ctx);
    expect(order).toEqual(['mw1-before', 'mw2-before', 'handler', 'mw2-after', 'mw1-after']);
  });
});

describe('withRateLimit', () => {
  it('allows requests under the limit', async () => {
    const mw = withRateLimit({ maxRequests: 3, windowMs: 60_000 });
    const handler = mw(async () => Response.json({ ok: true }));
    const req = () => new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Session-Id': 'sess-1' },
    });
    const r1 = await handler(req(), ctx);
    const r2 = await handler(req(), ctx);
    const r3 = await handler(req(), ctx);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
  });

  it('returns 429 with Retry-After header when limit exceeded', async () => {
    const mw = withRateLimit({ maxRequests: 2, windowMs: 60_000 });
    const handler = mw(async () => Response.json({ ok: true }));
    const req = () => new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Session-Id': 'sess-2' },
    });
    await handler(req(), ctx);
    await handler(req(), ctx);
    const r3 = await handler(req(), ctx);
    expect(r3.status).toBe(429);
    const body = await r3.json();
    expect(body.error).toBe('RATE_LIMITED');
    expect(r3.headers.get('Retry-After')).toBeTruthy();
    const retryAfter = parseInt(r3.headers.get('Retry-After')!, 10);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('resets after window expires', async () => {
    const mw = withRateLimit({ maxRequests: 1, windowMs: 50 });
    const handler = mw(async () => Response.json({ ok: true }));
    const req = () => new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Session-Id': 'sess-3' },
    });
    await handler(req(), ctx);
    const r2 = await handler(req(), ctx);
    expect(r2.status).toBe(429);
    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));
    const r3 = await handler(req(), ctx);
    expect(r3.status).toBe(200);
  });

  it('uses custom keyExtractor', async () => {
    const mw = withRateLimit({
      maxRequests: 1,
      windowMs: 60_000,
      keyExtractor: (req) => req.headers.get('X-Custom-Key'),
    });
    const handler = mw(async () => Response.json({ ok: true }));
    const req1 = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Custom-Key': 'key-a' },
    });
    const req2 = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Custom-Key': 'key-b' },
    });
    const r1 = await handler(req1, ctx);
    const r2 = await handler(req2, ctx);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('returns 401 when session ID is missing (no anonymous bucket)', async () => {
    const mw = withRateLimit({ maxRequests: 10, windowMs: 60_000 });
    const handler = mw(async () => Response.json({ ok: true }));
    const req = new Request('http://localhost/test', { method: 'POST' });
    const res = await handler(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('SESSION_REQUIRED');
  });

  it('truncates session key longer than 128 chars — same truncated key shares bucket', async () => {
    const longKeyBase = 'a'.repeat(130);
    const mw = withRateLimit({ maxRequests: 1, windowMs: 60_000 });
    const handler = mw(async () => Response.json({ ok: true }));
    const req1 = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Session-Id': longKeyBase + '-suffix1' },
    });
    const req2 = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Session-Id': longKeyBase + '-suffix2' },
    });
    const r1 = await handler(req1, ctx);
    expect(r1.status).toBe(200);
    // Second request shares truncated key, hits limit
    const r2 = await handler(req2, ctx);
    expect(r2.status).toBe(429);
  });

  it('forces eviction when map exceeds 10,000 entries', async () => {
    // Use a very short window so entries expire quickly
    const mw = withRateLimit({ maxRequests: 100, windowMs: 1 });
    const handler = mw(async () => Response.json({ ok: true }));

    // Insert many unique keys
    for (let i = 0; i < 10_050; i++) {
      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'X-Session-Id': `burst-sess-${i}` },
      });
      await handler(req, ctx);
    }

    // Wait for entries to expire
    await new Promise((r) => setTimeout(r, 10));

    // Next request should trigger cap-based eviction; system remains functional
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Session-Id': 'post-burst' },
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
  });

  it('eviction clears expired entries after windowMs elapses', async () => {
    const mw = withRateLimit({ maxRequests: 10, windowMs: 30 });
    const handler = mw(async () => Response.json({ ok: true }));
    const req = () => new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'X-Session-Id': 'evict-test' },
    });

    await handler(req(), ctx);
    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 50));

    // Next request triggers eviction + creates fresh entry
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
  });

  it('returns 401 for empty-string session key', async () => {
    const mw = withRateLimit({
      maxRequests: 10,
      windowMs: 60_000,
      keyExtractor: () => '',
    });
    const handler = mw(async () => Response.json({ ok: true }));
    const req = new Request('http://localhost/test', { method: 'POST' });
    const res = await handler(req, ctx);
    expect(res.status).toBe(401);
  });
});

describe('withContentType', () => {
  it('rejects request with wrong Content-Type', async () => {
    const handler = withContentType('application/json', async () => Response.json({ ok: true }));
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('accepts request with matching Content-Type (including charset)', async () => {
    const handler = withContentType('application/json', async () => Response.json({ ok: true }));
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ data: 'test' }),
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
  });

  it('rejects request with missing Content-Type', async () => {
    const handler = withContentType('application/json', async () => Response.json({ ok: true }));
    const req = new Request('http://localhost/test', { method: 'POST' });
    const res = await handler(req, ctx);
    expect(res.status).toBe(415);
  });
});

describe('withBodySizeLimit (chunked transfer)', () => {
  it('rejects oversized body when Content-Length is missing (chunked)', async () => {
    const handler = withBodySizeLimit(10, async () => Response.json({ ok: true }));
    // Construct a Request then strip Content-Length to simulate chunked transfer
    const req = new Request('http://localhost/test', {
      method: 'POST',
      body: 'x'.repeat(100),
    });
    // Delete Content-Length header to simulate chunked encoding
    req.headers.delete('Content-Length');
    const res = await handler(req, ctx);
    expect(res.status).toBe(413);
  });

  it('allows body within limit when Content-Length is missing', async () => {
    const handler = withBodySizeLimit(1000, async (_req) => {
      const json = await _req.json();
      return Response.json(json);
    });
    const payload = JSON.stringify({ small: true });
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    req.headers.delete('Content-Length');
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.small).toBe(true);
  });
});

describe('withValidation — empty and binary body edge cases', () => {
  const schema = z.object({ name: z.string() });

  it('returns 400 for empty body (no content)', async () => {
    const handler = withValidation(schema, async () => Response.json({ ok: true }));
    const req = new Request('http://localhost/test', { method: 'POST' });
    const res = await handler(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 400 for binary/non-UTF8 body', async () => {
    const handler = withValidation(schema, async () => Response.json({ ok: true }));
    const binary = new Uint8Array([0x80, 0x81, 0xff, 0xfe, 0x00]);
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: binary,
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(400);
  });
});

describe('withBodySizeLimit — custom maxBytes and exact boundary', () => {
  it('rejects body at exactly maxBytes + 1', async () => {
    const handler = withBodySizeLimit(50, async () => Response.json({ ok: true }));
    const res = await handler(makeRequest(undefined, { 'Content-Length': '51' }), ctx);
    expect(res.status).toBe(413);
  });

  it('allows body at exactly maxBytes', async () => {
    const handler = withBodySizeLimit(50, async () => Response.json({ ok: true }));
    const res = await handler(makeRequest(undefined, { 'Content-Length': '50' }), ctx);
    expect(res.status).toBe(200);
  });

  it('passes through when no body and no Content-Length', async () => {
    const handler = withBodySizeLimit(100, async () => Response.json({ ok: true }));
    const req = new Request('http://localhost/test', { method: 'POST' });
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
  });
});

describe('applyMiddleware integration', () => {
  it('composes content-type + body-size + validation end-to-end', async () => {
    const schema = z.object({ msg: z.string() });
    const pipeline = compose(
      (h) => withContentType('application/json', h),
      (h) => withBodySizeLimit(10_000, h),
    );
    const handler = pipeline(
      withValidation(schema, async (_req, c) => Response.json({ echo: c.data.msg })),
    );

    // Happy path
    const res1 = await handler(makeRequest({ msg: 'hello' }), ctx);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.echo).toBe('hello');

    // Wrong content-type
    const req2 = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'test',
    });
    const res2 = await handler(req2, ctx);
    expect(res2.status).toBe(415);

    // Oversized
    const res3 = await handler(makeRequest({ msg: 'x' }, { 'Content-Length': '999999' }), ctx);
    expect(res3.status).toBe(413);
  });
});

describe('composed middleware stack with rate limit', () => {
  it('rate limit + content-type + body-size + error boundary — rejects at rate limit with 429', async () => {
    const stack = compose(
      (h) => withContentType('application/json', h),
      withRateLimit({ maxRequests: 1, windowMs: 60_000 }),
      (h) => withBodySizeLimit(10_000, h),
      withErrorBoundary,
    );
    const handler = stack(async () => Response.json({ ok: true }));

    const req = () => new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'composed-sess' },
    });

    const r1 = await handler(req(), ctx);
    expect(r1.status).toBe(200);

    const r2 = await handler(req(), ctx);
    expect(r2.status).toBe(429);
    expect(r2.headers.get('Retry-After')).toBeTruthy();
  });

  it('wrong Content-Type is rejected before rate limit runs', async () => {
    const stack = compose(
      (h) => withContentType('application/json', h),
      withRateLimit({ maxRequests: 1, windowMs: 60_000 }),
      (h) => withBodySizeLimit(10_000, h),
      withErrorBoundary,
    );
    const handler = stack(async () => Response.json({ ok: true }));

    // Send a bad Content-Type — should be 415 without consuming rate limit
    const badReq = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'X-Session-Id': 'ct-test-sess' },
      body: 'test',
    });
    const res1 = await handler(badReq, ctx);
    expect(res1.status).toBe(415);

    // Good request after — should still work (rate limit not consumed)
    const goodReq = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'ct-test-sess' },
    });
    const res2 = await handler(goodReq, ctx);
    expect(res2.status).toBe(200);
  });

  it('missing session ID returns 401 in composed stack', async () => {
    const stack = compose(
      (h) => withContentType('application/json', h),
      withRateLimit({ maxRequests: 10, windowMs: 60_000 }),
      withErrorBoundary,
    );
    const handler = stack(async () => Response.json({ ok: true }));

    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(401);
  });
});
