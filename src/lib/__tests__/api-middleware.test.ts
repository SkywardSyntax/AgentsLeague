import { describe, it, expect, vi } from 'vitest';
import {
  apiError,
  withRequestId,
  withErrorBoundary,
  withValidation,
  withBodySizeLimit,
  compose,
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
