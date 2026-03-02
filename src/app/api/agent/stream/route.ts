import { randomUUID } from 'crypto';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { AgentStreamRequestSchema } from '@/lib/schema';
import {
  AGENT_SYSTEM_PROMPT,
  DRAW_TOOL_DEFINITION,
  GRAPH_SCRIPT_TOOL_DEFINITION,
  SEMANTIC_DRAW_TOOL_DEFINITION,
  createOpenAIClient,
  getModel,
} from '@/lib/server/openai';
import { formatSSE, sseHeaders, createSSEHeartbeat, safeEnqueue } from '@/lib/server/sse';
import { createLogger } from '@/lib/server/logger';
import { applyMiddleware, withErrorBoundary } from '@/lib/server/api-middleware';
import type { HandlerContext } from '@/lib/server/api-middleware';
import { isMockMode, mockAgentStream } from './__mocks__/mock-stream';
import { buildWhiteboardContextMessage, buildWhiteboardContextMessageV2 } from '@/lib/server/stream/context-builder';
import { boundsOfBatch } from '@/lib/server/stream/bounds';
import { extractStableChunks, normalizeChunkKey, estimateProvisionalAdvance } from '@/lib/server/stream/provisional';
import { handleToolCall } from '@/lib/server/stream/tool-handler';
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

type FunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

function parseFunctionCallFromEvent(
  event: ResponseStreamEvent,
): FunctionCall | null {
  if (event.type === 'response.function_call_arguments.done') {
    const anyEvent = event as unknown as {
      call_id?: string;
      name?: string;
      arguments?: string;
      item?: { call_id?: string; name?: string; arguments?: string };
    };

    const callId = anyEvent.call_id ?? anyEvent.item?.call_id;
    const name = anyEvent.name ?? anyEvent.item?.name;
    const args = anyEvent.arguments ?? anyEvent.item?.arguments;
    if (callId && name && typeof args === 'string') {
      return { callId, name, arguments: args };
    }
  }

  if (event.type === 'response.output_item.done') {
    const anyEvent = event as unknown as {
      item?: {
        type?: string;
        call_id?: string;
        name?: string;
        arguments?: string;
      };
    };

    if (anyEvent.item?.type === 'function_call') {
      const callId = anyEvent.item.call_id;
      const name = anyEvent.item.name;
      const args = anyEvent.item.arguments;
      if (callId && name && typeof args === 'string') {
        return { callId, name, arguments: args };
      }
    }
  }

  return null;
}

async function handlePost(request: Request, ctx: HandlerContext): Promise<Response> {
  const requestId = ctx.requestId;
  const startTime = Date.now();
  const log = createLogger({ requestId, route: '/api/agent/stream' });

  // Content-Type validation — consistent across mock and non-mock paths
  const ct = request.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) {
    return new Response(
      JSON.stringify({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' }),
      { status: 415, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }

  // Body size guard — reject before parsing to avoid memory exhaustion
  const MAX_BODY_BYTES = 524_288; // 512 KB
  const contentLength = request.headers.get('Content-Length');
  if (contentLength) {
    const len = parseInt(contentLength, 10);
    if (!Number.isNaN(len) && len > MAX_BODY_BYTES) {
      log.warn('payload_too_large', { bytes: len, maxBytes: MAX_BODY_BYTES });
      return new Response(
        JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: `Request body exceeds ${MAX_BODY_BYTES} bytes` }),
        { status: 413, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
      );
    }
  }

  // Server-only mock gate — fail-closed: in mock mode, never reach OpenAI
  if (isMockMode()) {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'Request body must be JSON' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
      );
    }
    const body = json as { userMessage?: string };
    log.info('mock_stream_request');
    return mockAgentStream({ userMessage: body.userMessage ?? '' });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'BAD_REQUEST', message: 'Request body must be JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }

  const parsed = AgentStreamRequestSchema.safeParse(json);
  if (!parsed.success) {
    log.warn('validation_error', { issues: parsed.error.issues.length });
    return new Response(
      JSON.stringify({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }

  log.info('stream_start', { sessionId: parsed.data.sessionId, plannerMode: parsed.data.plannerMode });

  const client = createOpenAIClient();
  const turnId = randomUUID();
  const plannerMode = parsed.data.plannerMode ?? 'semantic_preferred';

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
      const send = (payload: unknown) => {
        if (clientDisconnected) return;
        if (!safeEnqueue(controller, formatSSE(payload), encoder)) {
          clientDisconnected = true;
        }
      };

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

        const emitProvisionalFromStream = () => {
          if (plannerMode === 'legacy_draw_only') return;
          if (sawToolBatchInTurn) return;
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
          if (turnAbort.signal.aborted) {
            send({ type: 'error', turnId, code: 'TURN_TIMEOUT', message: 'Turn exceeded 90s timeout', retryable: true });
            break;
          }
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
              signal: turnAbort.signal,
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
              streamTextBuffer += event.delta;
              if (streamTextBuffer.length > MAX_STREAM_BUFFER) {
                streamTextBuffer = streamTextBuffer.slice(streamTextBuffer.length - MAX_STREAM_BUFFER);
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
              streamTextBuffer += event.text;
              if (streamTextBuffer.length > MAX_STREAM_BUFFER) {
                streamTextBuffer = streamTextBuffer.slice(streamTextBuffer.length - MAX_STREAM_BUFFER);
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
            emitProvisionalFromStream();
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

        if (!sawTextInTurn) {
          send({
            type: 'warning',
            turnId,
            code: 'NO_TEXT_OUTPUT',
            message: 'Turn completed without assistant text output',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected stream failure';
        log.error('stream_failure', { turnId, error: message, durationMs: Date.now() - startTime });
        send({
          type: 'error',
          turnId,
          code: 'STREAM_FAILURE',
          message,
          retryable: true,
        });
      } finally {
        heartbeat.stop();
        clearTimeout(turnTimer);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...sseHeaders(), 'X-Request-Id': requestId } });
}

export const POST = applyMiddleware(withErrorBoundary, handlePost);
