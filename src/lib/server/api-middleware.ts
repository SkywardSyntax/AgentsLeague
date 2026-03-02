import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/server/logger';
import type { z } from 'zod';

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

type Handler = (request: Request, ctx: HandlerContext) => Promise<Response> | Response;
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

export function withBodySizeLimit(maxBytes: number, handler: Handler): Handler {
  return async (request, ctx) => {
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return apiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes`, ctx.requestId);
    }
    return handler(request, ctx);
  };
}

/** Compose middlewares right-to-left: compose(a, b)(handler) = a(b(handler)) */
export function compose(...middlewares: Middleware[]): Middleware {
  return (handler: Handler) => middlewares.reduceRight((h, mw) => mw(h), handler);
}

/** Wraps a Next.js route handler with middleware, injecting context. */
export function applyMiddleware(
  middleware: Middleware,
  handler: Handler,
): (request: Request) => Promise<Response> {
  const wrapped = middleware(handler);
  return async (request: Request) => wrapped(request, { requestId: randomUUID() });
}
