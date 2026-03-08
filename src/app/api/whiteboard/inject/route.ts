import { z } from 'zod';
import { DrawBatchSchema, SemanticBatchSchema } from '@/lib/schema';
import {
  applyDrawBatch,
  type WhiteboardApplyContext,
} from '@/lib/server/whiteboard/apply-draw-batch';
import {
  applyMiddleware,
  compose,
  withErrorBoundary,
  withRequestId,
  withBodySizeLimit,
  withContentType,
  withRateLimit,
  withValidation,
  type HandlerContext,
} from '@/lib/server/api-middleware';

export const runtime = 'nodejs';

const InjectBodySchema = z.union([DrawBatchSchema, SemanticBatchSchema]);

const MAX_BODY_BYTES = 256 * 1024; // 256 KB

const middleware = compose(
  withRequestId,
  withErrorBoundary,
  withRateLimit({ maxRequests: 30, windowMs: 60_000 }),
  (h) => withBodySizeLimit(MAX_BODY_BYTES, h),
  (h) => withContentType('application/json', h),
);

async function handler(
  request: Request,
  ctx: HandlerContext & { data: z.infer<typeof InjectBodySchema> },
): Promise<Response> {
  const sessionId = request.headers.get('X-Session-Id') ?? ctx.requestId;
  const seqHeader = request.headers.get('X-Sequence-Number');
  const sequenceNumber = seqHeader ? parseInt(seqHeader, 10) : undefined;

  const applyCtx: WhiteboardApplyContext = {
    sessionId,
    sequenceNumber: sequenceNumber && !Number.isNaN(sequenceNumber) ? sequenceNumber : undefined,
  };

  const result = applyDrawBatch(ctx.data, applyCtx);

  if (!result.success) {
    return Response.json(
      {
        ok: false,
        error: 'APPLY_FAILED',
        message: result.warnings.join('; ') || 'Draw batch application failed',
        requestId: ctx.requestId,
      },
      {
        status: 422,
        headers: { 'X-Request-Id': ctx.requestId },
      },
    );
  }

  const appliedBatch = { ...result.batch, source: 'injection' as const };

  return Response.json(
    {
      ok: true,
      batch: appliedBatch,
      diagnostics: {
        violationsFixed: result.warnings.filter((w) => w.startsWith('layout_repaired')),
        fallbackUsed: result.warnings.includes('layout_fallback_used'),
        elementCount: result.batch.elements.length,
        ...(result.loweringStats
          ? {
              loweringStats: {
                inputCount: result.loweringStats.inputCount,
                outputCount: result.loweringStats.outputCount,
                capped: result.loweringStats.capped,
                timingMs: result.loweringStats.timingMs,
              },
            }
          : {}),
      },
    },
    {
      status: 200,
      headers: {
        'X-Request-Id': ctx.requestId,
        'Cache-Control': 'no-store',
      },
    },
  );
}

export const POST = applyMiddleware(
  middleware,
  withValidation(InjectBodySchema, handler),
);
