import { randomUUID } from 'crypto';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { z } from 'zod';
import {
  AgentStreamRequestSchema,
  DrawBatchSchema,
  SemanticBatchSchema,
  normalizeDrawBatchPayload,
  normalizeSemanticBatchPayload,
} from '@/lib/schema';
import {
  AGENT_SYSTEM_PROMPT,
  DRAW_TOOL_DEFINITION,
  GRAPH_SCRIPT_TOOL_DEFINITION,
  SEMANTIC_DRAW_TOOL_DEFINITION,
  createOpenAIClient,
  getModel,
} from '@/lib/server/openai';
import { formatSSE, sseHeaders, createSSEHeartbeat, safeEnqueue, formatSSEComment } from '@/lib/server/sse';
import { appendToStreamBuffer } from '@/lib/server/stream-buffer';
import { createLogger, logStreamEvent } from '@/lib/server/logger';
import {
  applyMiddleware,
  compose,
  withErrorBoundary,
  withContentType,
  withBodySizeLimit,
  withRateLimit,
} from '@/lib/server/api-middleware';
import type { HandlerContext, Handler } from '@/lib/server/api-middleware';
import { isMockMode, mockAgentStream } from './__mocks__/mock-stream';
import { buildWhiteboardContextMessage, buildWhiteboardContextMessageV2 } from '@/lib/server/stream/context-builder';
import { boundsOfBatch } from '@/lib/server/stream/bounds';
import { extractStableChunks, normalizeChunkKey, estimateProvisionalAdvance } from '@/lib/server/stream/provisional';
import { handleToolCall } from '@/lib/server/stream/tool-handler';
import { parseFunctionCallFromEvent } from '@/lib/server/stream/event-parser';
import type { FunctionCall } from '@/lib/server/stream/event-parser';
import {
  enforceDrawBatchConstraints,
  lowerPlannedLayoutToDrawBatch,
  planSemanticBatch,
} from '@/lib/whiteboard/planner';
import type {
  SemanticBatch,
  StructuredWhiteboardContext,
} from '@/types/agent';

export const runtime = 'nodejs';

/** Concurrent stream guard — at most one active stream per sessionId */
const activeStreams = new Set<string>();

export interface ClassifiedError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export function classifyStreamError(error: unknown, requestAborted: boolean): ClassifiedError {
  if (error == null || typeof error !== 'object') {
    const message = typeof error === 'string' ? error : 'Unexpected stream failure';
    return { code: 'STREAM_FAILURE', message, retryable: true };
  }
  const errObj = error as Record<string, unknown>;

  const errName = typeof errObj.name === 'string' ? errObj.name : undefined;
  if (errName === 'AbortError') {
    if (requestAborted) {
      return { code: 'CLIENT_DISCONNECTED', message: 'Client disconnected', retryable: false };
    }
    return { code: 'TURN_TIMEOUT', message: 'Turn timed out', retryable: true };
  }

  // OpenAI SDK error detection via status code (safe across SDK versions)
  const status = typeof errObj.status === 'number' ? errObj.status : undefined;
  if (status === 429) {
    const headers = errObj.headers as Record<string, string> | undefined;
    const retryAfterSec = headers?.['retry-after'];
    const rawMs = retryAfterSec ? Math.ceil(Number(retryAfterSec) * 1000) : undefined;
    const retryAfterMs = Number.isFinite(rawMs) ? rawMs : undefined;
    return { code: 'RATE_LIMIT', message: 'Rate limited by upstream', retryable: true, retryAfterMs };
  }
  if (status === 401 || status === 403) {
    return { code: 'AUTH_ERROR', message: 'Authentication failed', retryable: false };
  }
  if (error instanceof Error && /Connection error|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(error.message)) {
    return { code: 'API_CONNECTION_ERROR', message: error.message, retryable: true };
  }
  const errorCode = typeof errObj.code === 'string' ? errObj.code : undefined;
  if (typeof errorCode === 'string' && /^(ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN)$/.test(errorCode)) {
    const message = error instanceof Error ? error.message : 'Network error';
    return { code: 'API_CONNECTION_ERROR', message, retryable: true };
  }

  const message = error instanceof Error ? error.message : 'Unexpected stream failure';
  return { code: 'STREAM_FAILURE', message, retryable: true };
}

export async function parseRequestJson(
  request: Request,
  requestId: string,
): Promise<{ json: unknown } | Response> {
  try {
    return { json: await request.json() };
  } catch {
    logStreamEvent('warn', 'stream_rejected', { requestId, reason: 'BAD_REQUEST', status: 400 });
    return new Response(
      JSON.stringify({ error: 'BAD_REQUEST', message: 'Request body must be JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }
}

async function handlePost(request: Request, ctx: HandlerContext): Promise<Response> {
  const requestId = ctx.requestId;
  const startTime = Date.now();
  const log = createLogger({ requestId, route: '/api/agent/stream' });

  // Server-only mock gate — fail-closed: in mock mode, never reach OpenAI
  if (isMockMode()) {
    const result = await parseRequestJson(request, requestId);
    if (result instanceof Response) return result;
    const body = result.json as { userMessage?: string };
    log.info('mock_stream_request');
    return mockAgentStream({ userMessage: body.userMessage ?? '' });
  }

  const result = await parseRequestJson(request, requestId);
  if (result instanceof Response) return result;
  const json = result.json;

  const parsed = AgentStreamRequestSchema.safeParse(json);
  if (!parsed.success) {
    log.warn('validation_error', { issues: parsed.error.issues.length });
    return Response.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.issues, requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } },
    );
  }

  const sessionId = parsed.data.sessionId;

  // Concurrent stream guard — reject if this session already has an active stream
  if (activeStreams.has(sessionId)) {
    log.warn('stream_rejected', { sessionId, reason: 'CONCURRENT_STREAM', status: 409 });
    return Response.json(
      { error: 'CONCURRENT_STREAM', message: 'A stream is already active for this session', requestId },
      { status: 409, headers: { 'X-Request-Id': requestId } },
    );
  }
  activeStreams.add(sessionId);

  log.info('stream_start', {
    sessionId,
    plannerMode: parsed.data.plannerMode,
    messageCount: parsed.data.history.length + 1,
    hasHistory: parsed.data.history.length > 0,
  });

  const client = createOpenAIClient();
  const turnId = randomUUID();
  const plannerMode = parsed.data.plannerMode ?? 'semantic_preferred';
  const streamStartTime = Date.now();

  const initialInput = [
    ...(parsed.data.whiteboardContextV2
      ? [
          {
            role: 'system' as const,
            content: buildWhiteboardContextMessageV2(parsed.data.whiteboardContextV2),
          },
        ]
      : parsed.data.whiteboardContext
      ? [
          {
            role: 'system' as const,
            content: buildWhiteboardContextMessage(parsed.data.whiteboardContext),
          },
        ]
      : []),
    ...parsed.data.history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user' as const, content: parsed.data.userMessage },
  ];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let clientDisconnected = false;
      let eventCount = 0;
      const send = (payload: unknown) => {
        if (clientDisconnected) return;
        eventCount++;
        if (!safeEnqueue(controller, formatSSE(payload), encoder)) {
          clientDisconnected = true;
        }
      };
      const heartbeatEncoder = new TextEncoder();
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(heartbeatEncoder.encode(formatSSEComment('heartbeat')));
        } catch { /* stream already closed */ }
      }, 15_000);
      let lastIteration = 0;

      logStreamEvent('info', 'stream_start', {
        requestId,
        sessionId,
        turnId,
        plannerMode,
        messageLength: parsed.data.userMessage.length,
        historyLength: parsed.data.history.length,
      });

      let turnTimer: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = createSSEHeartbeat(controller);

      try {
        let loopInput:
          | Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
          | Array<{ type: 'function_call_output'; call_id: string; output: string }> =
          initialInput;
        let previousResponseId: string | undefined;
        let sawTextInTurn = false;
        let sawToolBatchInTurn = false;
        let finalUsage: { prompt?: number; completion?: number; total?: number } | undefined;
        let streamTextBuffer = '';
        const MAX_STREAM_BUFFER = 32_768;
        const provisionalSeen = new Set<string>();
        let provisionalIndex = 0;
        let turnContextV2 = parsed.data.whiteboardContextV2
          ? (JSON.parse(JSON.stringify(parsed.data.whiteboardContextV2)) as StructuredWhiteboardContext)
          : undefined;
        const initialOrigin = parsed.data.whiteboardContextV2?.suggested_next_regions[0]
          ? {
              x: parsed.data.whiteboardContextV2.suggested_next_regions[0].x,
              y: parsed.data.whiteboardContextV2.suggested_next_regions[0].y,
            }
          : parsed.data.whiteboardContext
            ? {
                x: parsed.data.whiteboardContext.suggestedNextOrigin.x,
                y: parsed.data.whiteboardContext.suggestedNextOrigin.y,
              }
            : { x: 64, y: 96 };
        let provisionalOrigin = { ...initialOrigin };

        const buildProvisionalContext = (): StructuredWhiteboardContext | undefined => {
          const ctx = turnContextV2;
          if (!ctx) return undefined;
          const primary = ctx.suggested_next_regions[0] ?? {
            name: 'below_full',
            x: provisionalOrigin.x,
            y: provisionalOrigin.y,
            w: 1200,
            h: 380,
            score: 1,
          };
          return {
            ...ctx,
            suggested_next_regions: [
              {
                ...primary,
                x: provisionalOrigin.x,
                y: provisionalOrigin.y,
              },
              ...ctx.suggested_next_regions.slice(1),
            ],
          };
        };

        let lastProvisionalEmitTime = 0;
        const PROVISIONAL_THROTTLE_MS = 300;

        const emitProvisionalFromStream = (force = false) => {
          if (plannerMode === 'legacy_draw_only') return;
          if (sawToolBatchInTurn) return;
          if (!force) {
            const now = Date.now();
            if (now - lastProvisionalEmitTime < PROVISIONAL_THROTTLE_MS) return;
            lastProvisionalEmitTime = now;
          }
          const chunks = extractStableChunks(streamTextBuffer);
          const MAX_PROVISIONAL_CHUNKS_PER_TURN = 10;
          for (const chunk of chunks) {
            if (provisionalIndex >= MAX_PROVISIONAL_CHUNKS_PER_TURN) break;
            const key = normalizeChunkKey(chunk.kind, chunk.value);
            if (provisionalSeen.has(key)) continue;
            provisionalSeen.add(key);

            const idx = provisionalIndex++;
            const semanticBatch: SemanticBatch =
              chunk.kind === 'latex'
                ? {
                    batch_id: `stream-provisional-${turnId}-${idx}`,
                    template: 'equation_derivation_vertical',
                    intent: 'derive',
                    blocks: [
                      {
                        id: `stream-latex-${idx}`,
                        kind: 'equation_stack',
                        region_hint: 'auto',
                        lines: [{ id: 'line-1', tex: chunk.value, displayMode: true }],
                      },
                    ],
                  }
                : {
                    batch_id: `stream-provisional-${turnId}-${idx}`,
                    template: 'freeform_semantic',
                    intent: 'teach',
                    blocks: [
                      {
                        id: `stream-text-${idx}`,
                        kind: 'caption',
                        region_hint: 'auto',
                        text: chunk.value,
                      },
                    ],
                  };

            const planned = planSemanticBatch(semanticBatch, buildProvisionalContext());
            const lowered = lowerPlannedLayoutToDrawBatch(planned);
            const constrained = enforceDrawBatchConstraints(lowered);

            send({
              type: 'whiteboard.layout.diagnostics',
              turnId,
              batchId: constrained.batch.batch_id,
              violationsFixed: constrained.violationsFixed,
              templateUsed: planned.templateUsed,
              fallbackUsed: constrained.fallbackUsed,
              semanticBatch,
            });
            send({ type: 'whiteboard.batch', turnId, batch: constrained.batch });

            const b = boundsOfBatch(constrained.batch);
            if (b) {
              provisionalOrigin = {
                x: Math.max(initialOrigin.x, b.minX),
                y: b.maxY + 40,
              };
            } else {
              provisionalOrigin = {
                x: initialOrigin.x,
                y: provisionalOrigin.y + estimateProvisionalAdvance(chunk),
              };
            }
          }
        };

        const TURN_TIMEOUT_MS = 90_000;
        const turnAbort = new AbortController();
        turnTimer = setTimeout(() => turnAbort.abort(), TURN_TIMEOUT_MS);

        for (let iteration = 0; iteration < 6; iteration++) {
          lastIteration = iteration;

          if (turnAbort.signal.aborted) {
            send({ type: 'error', turnId, code: 'TURN_TIMEOUT', message: 'Turn exceeded 90s timeout', retryable: true });
            break;
          }

          // Abort early if client disconnected between iterations
          if (request.signal.aborted) break;

          // Combine client disconnect + turn timeout + 120s stall timeout
          const iterationSignal = AbortSignal.any([
            request.signal,
            turnAbort.signal,
            AbortSignal.timeout(120_000),
          ]);

          const modelStream = await client.responses.create(
            {
              model: getModel(),
              instructions: AGENT_SYSTEM_PROMPT,
              input: loopInput,
              previous_response_id: previousResponseId,
              tools:
                plannerMode === 'legacy_draw_only'
                  ? [DRAW_TOOL_DEFINITION]
                  : [GRAPH_SCRIPT_TOOL_DEFINITION, SEMANTIC_DRAW_TOOL_DEFINITION, DRAW_TOOL_DEFINITION],
              tool_choice: 'auto',
              parallel_tool_calls: false,
              stream: true,
              max_output_tokens: 8_192,
              temperature: 0.6,
            },
            {
              signal: iterationSignal,
            },
          );

          const callIds = new Set<string>();
          const functionCalls: FunctionCall[] = [];
          const functionOutputs: Array<{ type: 'function_call_output'; call_id: string; output: string }> = [];
          let sawTextThisIteration = false;
          let textMessageId = randomUUID();

          for await (const event of modelStream as AsyncIterable<ResponseStreamEvent>) {
            if (event.type === 'response.output_text.delta') {
              sawTextThisIteration = true;
              sawTextInTurn = true;
              send({ type: 'assistant.text.delta', turnId, delta: event.delta });
              {
                const r = appendToStreamBuffer(streamTextBuffer, event.delta);
                streamTextBuffer = r.buffer;
                if (r.truncated) send({ type: 'warning', turnId, code: 'BUFFER_TRUNCATED', message: 'Stream buffer exceeded maximum size' });
              }
              if (/[\\\n\]}]$/.test(event.delta)) {
                emitProvisionalFromStream();
              }
              continue;
            }

            if (event.type === 'response.output_text.done' && !sawTextThisIteration) {
              sawTextThisIteration = true;
              sawTextInTurn = true;
              send({ type: 'assistant.text.delta', turnId, delta: event.text });
              {
                const r = appendToStreamBuffer(streamTextBuffer, event.text);
                streamTextBuffer = r.buffer;
                if (r.truncated) send({ type: 'warning', turnId, code: 'BUFFER_TRUNCATED', message: 'Stream buffer exceeded maximum size' });
              }
              emitProvisionalFromStream();
              continue;
            }

            if (event.type === 'response.completed') {
              previousResponseId = event.response.id;
              const usage = event.response.usage;
              if (usage) {
                finalUsage = {
                  prompt: usage.input_tokens,
                  completion: usage.output_tokens,
                  total: usage.total_tokens,
                };
              }
              continue;
            }

            if (event.type === 'error') {
              send({
                type: 'error',
                turnId,
                code: 'MODEL_STREAM_ERROR',
                message: event.message,
                retryable: true,
              });
              continue;
            }

            const fnCall = parseFunctionCallFromEvent(event);
            if (!fnCall) continue;
            if (
              fnCall.name !== 'emit_draw_batch' &&
              fnCall.name !== 'emit_semantic_batch' &&
              fnCall.name !== 'emit_graph_script'
            ) {
              continue;
            }
            if (callIds.has(fnCall.callId)) continue;
            callIds.add(fnCall.callId);
            functionCalls.push(fnCall);
          }

          if (sawTextThisIteration) {
            send({ type: 'assistant.text.done', turnId, messageId: textMessageId });
            emitProvisionalFromStream(true);
            textMessageId = randomUUID();
          }

          for (const fnCall of functionCalls) {
            let parsedArgs: unknown;
            try {
              parsedArgs = JSON.parse(fnCall.arguments);
            } catch {
              send({
                type: 'warning',
                turnId,
                code: 'INVALID_TOOL_JSON',
                message: `Model emitted invalid JSON arguments for ${fnCall.name}`,
              });
              functionOutputs.push({
                type: 'function_call_output',
                call_id: fnCall.callId,
                output: JSON.stringify({ ok: false, error: 'invalid_json' }),
              });
              continue;
            }

            const toolCtx = { send, turnId, turnContextV2, plannerMode, log };
            const result = handleToolCall(fnCall.name, parsedArgs, toolCtx);
            if (result) {
              if (result.sawToolBatch) sawToolBatchInTurn = true;
              turnContextV2 = result.updatedContext;
              if (result.provisionalOrigin) {
                provisionalOrigin = result.provisionalOrigin;
              }
              functionOutputs.push({
                type: 'function_call_output',
                call_id: fnCall.callId,
                output: result.functionOutput,
              });
            } else {
              functionOutputs.push({
                type: 'function_call_output',
                call_id: fnCall.callId,
                output: JSON.stringify({ ok: false, error: 'unsupported_tool' }),
              });
            }
          }

          if (functionOutputs.length === 0) {
            break;
          }

          loopInput = functionOutputs;
        }

        send({ type: 'turn.done', turnId, usage: finalUsage });
        log.info('stream_end', { turnId, durationMs: Date.now() - startTime, usage: finalUsage });

        logStreamEvent('info', 'stream_complete', {
          requestId,
          sessionId,
          turnId,
          durationMs: Date.now() - streamStartTime,
          eventCount,
          iterations: lastIteration,
        });

        if (!sawTextInTurn) {
          send({
            type: 'warning',
            turnId,
            code: 'NO_TEXT_OUTPUT',
            message: 'Turn completed without assistant text output',
          });
        }
      } catch (error) {
        const classified = classifyStreamError(error, request.signal.aborted);
        log.error('stream_failure', { turnId, code: classified.code, error: classified.message, durationMs: Date.now() - startTime });

        logStreamEvent('error', 'stream_error', {
          requestId,
          sessionId,
          turnId,
          code: classified.code,
          phase: `iteration_${lastIteration}`,
          durationMs: Date.now() - streamStartTime,
          eventCount,
          error: classified.message,
        });

        // Only send error events if the client is still connected
        if (!request.signal.aborted) {
          send({
            type: 'error',
            turnId,
            code: classified.code,
            message: classified.message,
            retryable: classified.retryable,
            ...(classified.retryAfterMs != null ? { retryAfterMs: classified.retryAfterMs } : {}),
          });
          // Terminal event contract: turn.done is always the last event
          send({ type: 'turn.done', turnId, partial: true });
        }
      } finally {
        heartbeat.stop();
        clearTimeout(turnTimer);
        clearInterval(heartbeatInterval);
        activeStreams.delete(sessionId);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...sseHeaders(), 'X-Request-Id': requestId } });
}

export const POST = applyMiddleware(
  compose(
    (h: Handler) => withContentType('application/json', h),
    withRateLimit({ maxRequests: 30, windowMs: 60_000 }),
    (h: Handler) => withBodySizeLimit(512 * 1024, h),
    withErrorBoundary,
  ),
  handlePost,
);
