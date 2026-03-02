import { describe, it, expect } from 'vitest';
import {
  withErrorBoundary,
  applyMiddleware,
  compose,
  withContentType,
} from '@/lib/server/api-middleware';
import type { HandlerContext } from '@/lib/server/api-middleware';

const ctx: HandlerContext = { requestId: 'test-req-id' };

describe('withErrorBoundary + streaming route integration', () => {
  it('catches sync error thrown during handler setup and returns JSON 500', async () => {
    const handler = withErrorBoundary(async () => {
      throw new Error('createOpenAIClient failed');
    });
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: 'hello' }),
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.requestId).toBe('test-req-id');
  });

  it('preserves successful streaming response unchanged', async () => {
    const handler = withErrorBoundary(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"test"}\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data: {"type":"test"}');
  });

  it('catches non-Error throwable during setup', async () => {
    const handler = withErrorBoundary(async () => {
      throw 'string error';
    });
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('does not interfere with errors inside an already-started stream', async () => {
    const handler = withErrorBoundary(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"ok":true}\n\n'));
          // Error after first chunk — stream already committed
          controller.error(new Error('mid-stream failure'));
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
    });
    // withErrorBoundary returns 200 since the Response was constructed successfully
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
  });

  it('works with applyMiddleware to produce a Next.js-compatible handler', async () => {
    const handlePost = async (_req: Request, innerCtx: HandlerContext) => {
      return Response.json({ requestId: innerCtx.requestId });
    };
    const POST = applyMiddleware(withErrorBoundary, handlePost);
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestId).toBeDefined();
  });

  it('applyMiddleware + withErrorBoundary catches thrown error from handler', async () => {
    const handlePost = async (): Promise<Response> => {
      throw new Error('setup boom');
    };
    const POST = applyMiddleware(withErrorBoundary, handlePost);
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('composes withErrorBoundary + withContentType for LaTeX route pattern', async () => {
    const pipeline = compose(
      (h) => withErrorBoundary(h),
      (h) => withContentType('application/json', h),
    );
    const handler = pipeline(async () => Response.json({ svg: '<svg/>' }));

    // Wrong content type → 415 (caught by withContentType before withErrorBoundary)
    const req1 = new Request('http://localhost/api/latex/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'test',
    });
    const res1 = await handler(req1, ctx);
    expect(res1.status).toBe(415);

    // Correct content type → 200
    const req2 = new Request('http://localhost/api/latex/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tex: 'x^2' }),
    });
    const res2 = await handler(req2, ctx);
    expect(res2.status).toBe(200);
  });
});
