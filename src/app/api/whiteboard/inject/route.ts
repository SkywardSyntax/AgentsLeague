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
import { corsPreflightResponse } from '@/lib/cors';
import { sanitizePasteText } from '@/lib/whiteboard/canvas-input-sanitizer';
import { validateInput } from '@/lib/security/owasp-validators';

export const runtime = 'nodejs';

// --- Idempotency cache (TTL: 5 minutes) ---
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const idempotencyCache = new Map<string, { response: string; status: number; headers: Record<string, string>; expiresAt: number }>();

function pruneIdempotencyCache() {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (entry.expiresAt <= now) idempotencyCache.delete(key);
  }
}

export async function OPTIONS() {
  return corsPreflightResponse();
}

const InjectBodySchema = z.union([DrawBatchSchema, SemanticBatchSchema]);

const MAX_BODY_BYTES = 256 * 1024; // 256 KB
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024; // 2 MB hard limit

const middleware = compose(
  withRequestId,
  withErrorBoundary,
  withRateLimit({
    maxRequests: 100,
    windowMs: 60_000,
    keyExtractor: (request) => {
      return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
    },
  }),
  (h) => withBodySizeLimit(MAX_BODY_BYTES, h),
  (h) => withContentType('application/json', h),
);

/** Sanitize a single string field via sanitizePasteText. */
function sanitizeStr(val: string): string {
  return sanitizePasteText(val).value;
}

/** Walk an object/array and sanitize every string-valued text field in place. */
function sanitizeTextFieldsDeep(obj: unknown): void {
  if (Array.isArray(obj)) {
    for (const item of obj) sanitizeTextFieldsDeep(item);
    return;
  }
  if (obj == null || typeof obj !== 'object') return;
  const TEXT_KEYS = ['text', 'label', 'title', 'tex', 'x_label', 'y_label'];
  const rec = obj as Record<string, unknown>;
  for (const key of TEXT_KEYS) {
    if (typeof rec[key] === 'string') {
      rec[key] = sanitizeStr(rec[key] as string);
    }
  }
  // Recurse into nested arrays/objects (bins, sets, vertices, captions, etc.)
  for (const val of Object.values(rec)) {
    if (Array.isArray(val) || (val != null && typeof val === 'object')) {
      sanitizeTextFieldsDeep(val);
    }
  }
}

/** Sanitize all user-supplied text fields in a validated draw/semantic batch. */
function sanitizeBatchTextFields(data: z.infer<typeof InjectBodySchema>): {
  data: z.infer<typeof InjectBodySchema>;
  rejected: boolean;
  reason?: string;
} {
  // Validate the batch_id against injection patterns
  const idCheck = validateInput(data.batch_id, ['sql', 'path', 'command']);
  if (!idCheck.safe) {
    return { data, rejected: true, reason: `batch_id failed security validation: ${idCheck.threats.join(', ')}` };
  }

  if ('elements' in data) {
    for (const el of data.elements) sanitizeTextFieldsDeep(el);
  } else if ('blocks' in data) {
    for (const block of data.blocks) sanitizeTextFieldsDeep(block);
  }

  return { data, rejected: false };
}

async function handler(
  request: Request,
  ctx: HandlerContext & { data: z.infer<typeof InjectBodySchema> },
): Promise<Response> {
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_CONTENT_LENGTH) {
    return Response.json(
      { error: 'Payload too large', maxBytes: MAX_CONTENT_LENGTH },
      { status: 413, headers: { 'X-Request-Id': ctx.requestId } },
    );
  }

  // --- Idempotency check ---
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (idempotencyKey) {
    pruneIdempotencyCache();
    const cached = idempotencyCache.get(idempotencyKey);
    if (cached && cached.expiresAt > Date.now()) {
      return new Response(cached.response, {
        status: cached.status,
        headers: { ...cached.headers, 'X-Idempotent-Replayed': 'true' },
      });
    }
  }

  // Sanitize text content fields and validate against injection patterns
  const sanitizeResult = sanitizeBatchTextFields(ctx.data);
  if (sanitizeResult.rejected) {
    return Response.json(
      {
        ok: false,
        error: 'INPUT_REJECTED',
        message: sanitizeResult.reason ?? 'Input failed security validation',
        requestId: ctx.requestId,
      },
      { status: 400, headers: { 'X-Request-Id': ctx.requestId } },
    );
  }

  const sessionId = request.headers.get('X-Session-Id') ?? ctx.requestId;
  const seqHeader = request.headers.get('X-Sequence-Number');
  const sequenceNumber = seqHeader ? parseInt(seqHeader, 10) : undefined;

  const applyCtx: WhiteboardApplyContext = {
    sessionId,
    sequenceNumber: sequenceNumber && !Number.isNaN(sequenceNumber) ? sequenceNumber : undefined,
  };

  const result = applyDrawBatch(sanitizeResult.data, applyCtx);

  let response: Response;

  if (!result.success) {
    response = Response.json(
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
  } else {
    const appliedBatch = { ...result.batch, source: 'injection' as const };

    response = Response.json(
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

  // --- Cache for idempotency ---
  if (idempotencyKey) {
    const body = await response.clone().text();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    idempotencyCache.set(idempotencyKey, {
      response: body,
      status: response.status,
      headers,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });
  }

  return response;
}

export const POST = applyMiddleware(
  middleware,
  withValidation(InjectBodySchema, handler),
);
