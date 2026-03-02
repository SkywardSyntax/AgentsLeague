import { randomUUID } from 'crypto';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
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
import { sseHeaders, createSSESender, formatSSEComment } from '@/lib/server/sse';
import { isMockMode, mockAgentStream } from './__mocks__/mock-stream';
import {
  enforceDrawBatchConstraints,
  extendStructuredWhiteboardContext,
  fromLegacyDrawBatchToSemanticStub,
  lowerPlannedLayoutToDrawBatch,
  planSemanticBatch,
} from '@/lib/whiteboard/planner';
import { parseGraphScriptToSemanticBatch } from '@/lib/whiteboard/graph-script';
import type {
  DrawBatch,
  SemanticBatch,
  StructuredWhiteboardContext,
  WhiteboardBounds,
  WhiteboardContext,
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
  const errName = (error as { name?: string })?.name;
  if (errName === 'AbortError') {
    if (requestAborted) {
      return { code: 'CLIENT_DISCONNECTED', message: 'Client disconnected', retryable: false };
    }
    return { code: 'TURN_TIMEOUT', message: 'Turn timed out', retryable: true };
  }

  // OpenAI SDK error detection via status code (safe across SDK versions)
  const status = (error as { status?: number }).status;
  if (status === 429) {
    const headers = (error as { headers?: Record<string, string> }).headers;
    const retryAfterSec = headers?.['retry-after'];
    const retryAfterMs = retryAfterSec ? Math.ceil(Number(retryAfterSec) * 1000) : undefined;
    return { code: 'RATE_LIMIT', message: 'Rate limited by upstream', retryable: true, retryAfterMs };
  }
  if (status === 401 || status === 403) {
    return { code: 'AUTH_ERROR', message: 'Authentication failed', retryable: false };
  }
  if (error instanceof Error && error.message?.includes('Connection error')) {
    return { code: 'API_CONNECTION_ERROR', message: error.message, retryable: true };
  }

  const message = error instanceof Error ? error.message : 'Unexpected stream failure';
  return { code: 'STREAM_FAILURE', message, retryable: true };
}

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

function buildWhiteboardContextMessage(context: WhiteboardContext): string {
  const counts = Object.entries(context.elementTypeCounts)
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');
  const bounds = context.bounds
    ? `bounds=(${context.bounds.minX.toFixed(1)},${context.bounds.minY.toFixed(1)})..(${context.bounds.maxX.toFixed(1)},${context.bounds.maxY.toFixed(1)})`
    : 'bounds=none';

  const recent = context.recentElements
    .map((el) => `${el.type}:${el.id}${el.textPreview ? `="${el.textPreview.replace(/\s+/g, ' ').slice(0, 48)}"` : ''}`)
    .join(' | ');

  return [
    'WHITEBOARD CONTEXT (authoritative for this turn):',
    `- element_count=${context.elementCount}`,
    `- ${bounds}`,
    `- counts=${counts || 'none'}`,
    `- suggested_next_origin=(${context.suggestedNextOrigin.x.toFixed(1)}, ${context.suggestedNextOrigin.y.toFixed(1)})`,
    `- recent=${recent || 'none'}`,
    'Placement policy:',
    '- Default to placing new derivation steps at or below suggested_next_origin unless user explicitly asks to edit an existing region.',
    '- Keep each draw batch small and non-overlapping.',
  ].join('\n');
}

function clip(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1))}…`;
}

function buildWhiteboardContextMessageV2(context: StructuredWhiteboardContext): string {
  const maxChars = context.token_budget_hint.max_chars;
  const bounds = context.scene_summary.bounds
    ? `bounds=(${context.scene_summary.bounds.minX.toFixed(1)},${context.scene_summary.bounds.minY.toFixed(1)})..(${context.scene_summary.bounds.maxX.toFixed(1)},${context.scene_summary.bounds.maxY.toFixed(1)})`
    : 'bounds=none';
  const counts = Object.entries(context.scene_summary.type_counts)
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');

  const occupied = context.occupied_regions
    .slice(-10)
    .map((r) => `${r.id}@(${r.x.toFixed(0)},${r.y.toFixed(0)},${r.w.toFixed(0)}x${r.h.toFixed(0)})#${r.priority}`)
    .join(' | ');
  const anchors = context.anchors
    .slice(-12)
    .map((a) => `${a.role}:${a.id}@(${a.x.toFixed(0)},${a.y.toFixed(0)})`)
    .join(' | ');
  const recent = context.recent_blocks
    .slice(-10)
    .map((b) => `${b.kind}:${b.id}[${b.region}]${b.text_preview ? `="${b.text_preview}"` : ''}`)
    .join(' | ');
  const suggested = context.suggested_next_regions
    .map(
      (r) =>
        `${r.name}@(${r.x.toFixed(0)},${r.y.toFixed(0)},${r.w.toFixed(0)}x${r.h.toFixed(0)};score=${r.score.toFixed(2)})`,
    )
    .join(' | ');

  const message = [
    'WHITEBOARD CONTEXT V2 (authoritative):',
    `- scene.element_count=${context.scene_summary.element_count}`,
    `- ${bounds}`,
    `- scene.type_counts=${counts || 'none'}`,
    `- occupied_regions=${occupied || 'none'}`,
    `- anchors=${anchors || 'none'}`,
    `- recent_blocks=${recent || 'none'}`,
    `- suggested_next_regions=${suggested || 'none'}`,
    'Placement policy:',
    '- Prefer semantic templates and maintain strict visual legibility.',
    '- Default to highest-scored suggested_next_region unless user requests an explicit region rewrite.',
    '- Keep derivations top-to-bottom with clear block boundaries and no collisions.',
  ].join('\n');

  return clip(message, maxChars);
}

function boundsOfElementInBatch(el: DrawBatch['elements'][number]): WhiteboardBounds | null {
  if (el.type === 'rect') return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
  if (el.type === 'ellipse')
    return { minX: el.cx - el.rx, minY: el.cy - el.ry, maxX: el.cx + el.rx, maxY: el.cy + el.ry };
  if (el.type === 'line' || el.type === 'arrow') {
    return {
      minX: Math.min(el.from.x, el.to.x),
      minY: Math.min(el.from.y, el.to.y),
      maxX: Math.max(el.from.x, el.to.x),
      maxY: Math.max(el.from.y, el.to.y),
    };
  }
  if (el.type === 'text') {
    const size = el.size ?? 18;
    const width = Math.max(size * 0.45, el.text.length * size * 0.52);
    return { minX: el.x, minY: el.y - size * 0.9, maxX: el.x + width, maxY: el.y + size * 0.5 };
  }
  if (el.type === 'latex') {
    const size = el.fontSize ?? 20;
    const fracCount = (el.tex.match(/\\(?:d?frac|tfrac)\b/g) ?? []).length;
    const rootCount = (el.tex.match(/\\sqrt\b/g) ?? []).length;
    const sumLikeCount = (el.tex.match(/\\(?:sum|prod|int|lim)\b/g) ?? []).length;
    const matrixLikeCount = (el.tex.match(/\\(?:begin\{[^}]*matrix\}|begin\{array\}|cases|aligned|align)\b/g) ?? [])
      .length;
    const scriptCount = (el.tex.match(/[\^_]/g) ?? []).length;
    const lineBreakCount = (el.tex.match(/\\\\/g) ?? []).length;

    const widthScale = 0.44 + Math.min(0.16, fracCount * 0.02 + matrixLikeCount * 0.04);
    const width = Math.min(1460, Math.max(size * 1.8, el.tex.length * size * widthScale));

    const complexity =
      1 +
      fracCount * 0.55 +
      rootCount * 0.2 +
      sumLikeCount * 0.25 +
      matrixLikeCount * 1.2 +
      Math.min(1.2, scriptCount * 0.04) +
      lineBreakCount * 0.6;
    const baseHeight = size * (el.displayMode ? 1.95 : 1.45);
    const height = Math.max(size * (el.displayMode ? 2.15 : 1.5), baseHeight * complexity);

    let minX = el.x;
    if (el.align === 'center') minX = el.x - width / 2;
    if (el.align === 'right') minX = el.x - width;
    return { minX, minY: el.y - size * 1.02, maxX: minX + width, maxY: el.y + height };
  }
  return null;
}

function boundsOfBatch(batch: DrawBatch): WhiteboardBounds | null {
  let bounds: WhiteboardBounds | null = null;
  for (const el of batch.elements) {
    const b = boundsOfElementInBatch(el);
    if (!b) continue;
    if (!bounds) {
      bounds = { ...b };
      continue;
    }
    bounds = {
      minX: Math.min(bounds.minX, b.minX),
      minY: Math.min(bounds.minY, b.minY),
      maxX: Math.max(bounds.maxX, b.maxX),
      maxY: Math.max(bounds.maxY, b.maxY),
    };
  }
  return bounds;
}

function normalizeChunkKey(kind: 'latex' | 'text', value: string): string {
  return `${kind}:${value.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

function extractStableChunks(content: string): Array<{ kind: 'latex' | 'text'; value: string }> {
  const chunks: Array<{ kind: 'latex' | 'text'; value: string }> = [];

  const blockRegex = /\\\[((?:.|\n)*?)\\\]/g;
  let blockMatch: RegExpExecArray | null = null;
  while ((blockMatch = blockRegex.exec(content)) !== null) {
    const tex = blockMatch[1]?.trim();
    if (tex) chunks.push({ kind: 'latex', value: tex });
  }

  const lines = content.split('\n');
  const completeLines = content.endsWith('\n') ? lines : lines.slice(0, -1);
  for (const line of completeLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(\d+[\.)]\s+|step\s+\d+|[-*]\s+)/i.test(trimmed)) {
      chunks.push({ kind: 'text', value: trimmed });
    }
  }

  return chunks;
}

function estimateProvisionalAdvance(chunk: { kind: 'latex' | 'text'; value: string }): number {
  if (chunk.kind === 'text') {
    const wrappedLines = Math.max(1, Math.ceil(chunk.value.length / 62));
    return 20 + wrappedLines * 30;
  }
  const tex = chunk.value;
  const fracCount = (tex.match(/\\(?:d?frac|tfrac)\b/g) ?? []).length;
  const rootCount = (tex.match(/\\sqrt\b/g) ?? []).length;
  const matrixLikeCount = (tex.match(/\\(?:begin\{[^}]*matrix\}|begin\{array\}|cases|aligned|align)\b/g) ?? [])
    .length;
  const scriptCount = (tex.match(/[\^_]/g) ?? []).length;
  const lineBreakCount = (tex.match(/\\\\/g) ?? []).length;

  return Math.max(
    88,
    74 +
      fracCount * 22 +
      rootCount * 8 +
      matrixLikeCount * 56 +
      Math.min(24, scriptCount * 2) +
      lineBreakCount * 28,
  );
}

export async function POST(request: Request): Promise<Response> {
  // Server-only mock gate — fail-closed: in mock mode, never reach OpenAI
  if (isMockMode()) {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'BAD_REQUEST', message: 'Request body must be JSON' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const body = json as { userMessage?: string; scenario?: string };
    return mockAgentStream({ userMessage: body.userMessage ?? '', scenario: body.scenario as import('./__mocks__/mock-stream').MockScenario });
  }

  // Request body size guard — reject oversized payloads before parsing
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 512 * 1024) {
    return new Response(
      JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'Request too large' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'BAD_REQUEST', message: 'Request body must be JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const parsed = AgentStreamRequestSchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'VALIDATION_ERROR', issues: parsed.error.issues }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const sessionId = parsed.data.sessionId;

  // Concurrent stream guard — reject if this session already has an active stream
  if (activeStreams.has(sessionId)) {
    return new Response(
      JSON.stringify({ error: 'CONCURRENT_STREAM', message: 'A stream is already active for this session' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }
  activeStreams.add(sessionId);

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
      const send = createSSESender(controller);
      const heartbeatEncoder = new TextEncoder();
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(heartbeatEncoder.encode(formatSSEComment('heartbeat')));
        } catch { /* stream already closed */ }
      }, 15_000);
      let lastIteration = 0;

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

        for (let iteration = 0; iteration < 6; iteration++) {
          lastIteration = iteration;

          // Abort early if client disconnected between iterations
          if (request.signal.aborted) break;

          // Combine client disconnect + 120s stall timeout for the entire create+stream lifecycle
          const iterationSignal = AbortSignal.any([
            request.signal,
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
              streamTextBuffer += event.delta;
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

            if (fnCall.name === 'emit_graph_script') {
              const parsedGraph = parseGraphScriptToSemanticBatch(parsedArgs);
              if (!parsedGraph.semanticBatch) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'INVALID_GRAPH_SCRIPT',
                  message: 'Graph script could not be compiled',
                  context: parsedGraph.warnings.join('; '),
                });
                functionOutputs.push({
                  type: 'function_call_output',
                  call_id: fnCall.callId,
                  output: JSON.stringify({ ok: false, error: 'invalid_graph_script' }),
                });
                continue;
              }

              if (parsedGraph.warnings.length > 0) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'GRAPH_SCRIPT_NORMALIZED',
                  message: 'Graph script compiled with normalization',
                  context: parsedGraph.warnings.join('; '),
                });
              }

              const planned = planSemanticBatch(parsedGraph.semanticBatch, turnContextV2);
              let drawBatch = lowerPlannedLayoutToDrawBatch(planned);
              const constrained = enforceDrawBatchConstraints(drawBatch);
              drawBatch = constrained.batch;

              if (planned.warnings.length > 0) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'SEMANTIC_PLANNER_WARNING',
                  message: 'Graph script planner applied warnings',
                  context: planned.warnings.join('; '),
                });
              }

              const significantRepair =
                constrained.fallbackUsed ||
                constrained.violationsFixed.includes('region_reflow') ||
                constrained.violationsFixed.includes('scale_down_with_limits');
              if (significantRepair) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'LAYOUT_REPAIRED',
                  message: 'Layout constraints auto-repaired graph script batch',
                  context: constrained.violationsFixed.join(', '),
                });
              }

              send({
                type: 'whiteboard.layout.diagnostics',
                turnId,
                batchId: drawBatch.batch_id,
                violationsFixed: constrained.violationsFixed,
                templateUsed: planned.templateUsed,
                fallbackUsed: constrained.fallbackUsed,
                semanticBatch: planned.semanticBatch,
              });
              sawToolBatchInTurn = true;
              send({ type: 'whiteboard.batch', turnId, batch: drawBatch });
              turnContextV2 = extendStructuredWhiteboardContext(turnContextV2, drawBatch, planned.semanticBatch);
              const suggested = turnContextV2.suggested_next_regions[0];
              if (suggested) {
                provisionalOrigin = { x: suggested.x, y: suggested.y };
              }
              functionOutputs.push({
                type: 'function_call_output',
                call_id: fnCall.callId,
                output: JSON.stringify({
                  ok: true,
                  batch_id: drawBatch.batch_id,
                  repaired: constrained.violationsFixed.length > 0,
                  fallback_used: constrained.fallbackUsed,
                }),
              });
              continue;
            }

            if (fnCall.name === 'emit_semantic_batch') {
              let semanticPayload: SemanticBatch | null = null;
              let semanticWarnings: string[] = [];
              const semanticValidation = SemanticBatchSchema.safeParse(parsedArgs);
              if (semanticValidation.success) {
                semanticPayload = semanticValidation.data;
              } else {
                const normalized = normalizeSemanticBatchPayload(parsedArgs);
                semanticWarnings = normalized.warnings;
                if (normalized.normalized) {
                  const normalizedValidation = SemanticBatchSchema.safeParse(normalized.normalized);
                  if (normalizedValidation.success) {
                    semanticPayload = normalizedValidation.data;
                  } else {
                    semanticWarnings = [
                      ...semanticWarnings,
                      ...normalizedValidation.error.issues.map((i) => i.message),
                    ];
                  }
                } else {
                  semanticWarnings = [
                    ...semanticWarnings,
                    ...semanticValidation.error.issues.map((i) => i.message),
                  ];
                }
              }

              if (!semanticPayload) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'INVALID_SEMANTIC_BATCH',
                  message: 'Semantic draw batch failed validation and could not be repaired',
                  context: semanticWarnings.join('; '),
                });
                functionOutputs.push({
                  type: 'function_call_output',
                  call_id: fnCall.callId,
                  output: JSON.stringify({ ok: false, error: 'invalid_semantic_schema' }),
                });
                continue;
              }

              if (semanticWarnings.length > 0) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'SEMANTIC_BATCH_NORMALIZED',
                  message: 'Semantic draw batch was normalized for compatibility',
                  context: semanticWarnings.join('; '),
                });
              }

              const planned = planSemanticBatch(
                semanticPayload,
                turnContextV2,
              );
              let drawBatch = lowerPlannedLayoutToDrawBatch(planned);
              const constrained = enforceDrawBatchConstraints(drawBatch);
              drawBatch = constrained.batch;

              if (planned.warnings.length > 0) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'SEMANTIC_PLANNER_WARNING',
                  message: 'Semantic planner applied warnings',
                  context: planned.warnings.join('; '),
                });
              }

              const significantSemanticRepair =
                constrained.fallbackUsed ||
                constrained.violationsFixed.includes('region_reflow') ||
                constrained.violationsFixed.includes('scale_down_with_limits');
              if (significantSemanticRepair) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'LAYOUT_REPAIRED',
                  message: 'Layout constraints auto-repaired semantic batch',
                  context: constrained.violationsFixed.join(', '),
                });
              }

              send({
                type: 'whiteboard.layout.diagnostics',
                turnId,
                batchId: drawBatch.batch_id,
                violationsFixed: constrained.violationsFixed,
                templateUsed: planned.templateUsed,
                fallbackUsed: constrained.fallbackUsed,
                semanticBatch: semanticPayload,
              });
              sawToolBatchInTurn = true;
              send({ type: 'whiteboard.batch', turnId, batch: drawBatch });
              turnContextV2 = extendStructuredWhiteboardContext(turnContextV2, drawBatch, planned.semanticBatch);
              const suggested = turnContextV2.suggested_next_regions[0];
              if (suggested) {
                provisionalOrigin = { x: suggested.x, y: suggested.y };
              }
              functionOutputs.push({
                type: 'function_call_output',
                call_id: fnCall.callId,
                output: JSON.stringify({
                  ok: true,
                  batch_id: drawBatch.batch_id,
                  repaired: constrained.violationsFixed.length > 0,
                  fallback_used: constrained.fallbackUsed,
                }),
              });
              continue;
            }

            if (fnCall.name === 'emit_draw_batch') {
              const strictValidation = DrawBatchSchema.safeParse(parsedArgs);
              let normalizedBatch = strictValidation.success ? strictValidation.data : null;
              const normalizationWarnings: string[] = [];

              if (!normalizedBatch) {
                const normalized = normalizeDrawBatchPayload(parsedArgs);
                normalizedBatch = normalized.normalized;
                normalizationWarnings.push(...normalized.warnings);
              }

              if (!normalizedBatch || normalizedBatch.elements.length === 0) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'INVALID_DRAW_BATCH',
                  message: 'Draw batch failed validation and normalization',
                  context: strictValidation.success
                    ? 'No drawable elements found'
                    : strictValidation.error.issues.map((i) => i.message).join('; '),
                });
                functionOutputs.push({
                  type: 'function_call_output',
                  call_id: fnCall.callId,
                  output: JSON.stringify({ ok: false, error: 'invalid_schema' }),
                });
                continue;
              }

              if (normalizationWarnings.length > 0) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'DRAW_BATCH_NORMALIZED',
                  message: 'Some draw elements were normalized or dropped',
                  context: normalizationWarnings.join('; '),
                });
              }

              const constrained = enforceDrawBatchConstraints(normalizedBatch);
              const significantLegacyRepair =
                constrained.fallbackUsed ||
                constrained.violationsFixed.includes('region_reflow') ||
                constrained.violationsFixed.includes('scale_down_with_limits');
              if (significantLegacyRepair) {
                send({
                  type: 'warning',
                  turnId,
                  code: 'LAYOUT_REPAIRED',
                  message: 'Layout constraints auto-repaired legacy draw batch',
                  context: constrained.violationsFixed.join(', '),
                });
              }

              const legacySemantic = fromLegacyDrawBatchToSemanticStub(
                constrained.batch.batch_id,
                constrained.batch.elements,
              );
              send({
                type: 'whiteboard.layout.diagnostics',
                turnId,
                batchId: constrained.batch.batch_id,
                violationsFixed: constrained.violationsFixed,
                templateUsed: 'legacy_draw_batch',
                fallbackUsed: constrained.fallbackUsed,
                semanticBatch: legacySemantic,
              });
              sawToolBatchInTurn = true;
              send({ type: 'whiteboard.batch', turnId, batch: constrained.batch });
              turnContextV2 = extendStructuredWhiteboardContext(
                turnContextV2,
                constrained.batch,
                legacySemantic,
              );
              const suggested = turnContextV2.suggested_next_regions[0];
              if (suggested) {
                provisionalOrigin = { x: suggested.x, y: suggested.y };
              }
              functionOutputs.push({
                type: 'function_call_output',
                call_id: fnCall.callId,
                output: JSON.stringify({
                  ok: true,
                  batch_id: constrained.batch.batch_id,
                  repaired: constrained.violationsFixed.length > 0,
                  fallback_used: constrained.fallbackUsed,
                }),
              });
              continue;
            }

            functionOutputs.push({
              type: 'function_call_output',
              call_id: fnCall.callId,
              output: JSON.stringify({ ok: false, error: 'unsupported_tool' }),
            });
          }

          if (functionOutputs.length === 0) {
            break;
          }

          loopInput = functionOutputs;
        }

        send({ type: 'turn.done', turnId, usage: finalUsage });

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

        console.error('[agent/stream] Stream error', {
          turnId,
          sessionId,
          code: classified.code,
          iteration: lastIteration,
          durationMs: Date.now() - streamStartTime,
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
        clearInterval(heartbeatInterval);
        activeStreams.delete(sessionId);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
