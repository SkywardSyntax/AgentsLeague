/**
 * POST /api/draw — Streaming AI drawing generation.
 *
 * Accepts { userMessage, conversationHistory } and streams SSE events:
 *   - { type: "draw_op", data: DrawOp }
 *   - { type: "step_progress", step, summary }
 *   - { type: "done" }
 *   - { type: "error", code, message }
 */

import OpenAI from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { DrawRequestSchema, validateBody, errorResponse, handleOpenAIError } from '@/lib/api-utils/validation';
import { toSSE, writeError, createAbortSignal, sseHeaders } from '@/lib/api-utils/streaming';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const DRAW_SYSTEM_PROMPT = `You are an AI whiteboard assistant.
When the user asks you to draw, reply ONLY with a JSON array of drawing operations.
Each operation is one of:
  { "op": "add", "element": { "id": "<unique>", "type": "rect"|"ellipse"|"line"|"arrow"|"freehand"|"text"|"image", ... } }
  { "op": "update", "id": "<existing-id>", "patch": { ... } }
  { "op": "delete", "id": "<existing-id>" }
  { "op": "clear" }
Output ONLY valid JSON. Do not include markdown fences or commentary.`;

export async function POST(request: Request): Promise<Response> {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = rateLimit(ip, { windowMs: 60_000, max: 20 });
  if (!rl.ok) {
    return errorResponse('RATE_LIMITED', 'Too many requests', 429, {
      retryAfter: rl.retryAfter,
    });
  }

  // Validate request body
  const result = await validateBody(request, DrawRequestSchema);
  if ('error' in result) return result.error;
  const { userMessage, conversationHistory } = result.data;

  // Build input messages for OpenAI Responses API
  const input: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
  for (const msg of conversationHistory) {
    input.push({ role: msg.role, content: msg.content });
  }
  input.push({ role: 'user', content: userMessage });

  const requestId = crypto.randomUUID();
  const signal = createAbortSignal(30_000);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 60_000 });
    const stream = await client.responses.create(
      {
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        instructions: DRAW_SYSTEM_PROMPT,
        input,
        stream: true,
        temperature: 0.7,
        max_output_tokens: 16_000,
      },
      { signal },
    );

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let accumulated = '';
          for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
            if (event.type === 'response.output_text.delta') {
              accumulated += event.delta;
              // Try to parse complete draw ops from accumulated JSON
              const ops = tryParseDrawOps(accumulated);
              if (ops) {
                for (const op of ops) {
                  controller.enqueue(toSSE({ type: 'draw_op', data: op }));
                }
                accumulated = '';
              }
            } else if (event.type === 'error') {
              controller.enqueue(writeError('STREAM_ERROR', event.message));
            }
          }
          // Final parse attempt for any remaining content
          if (accumulated.trim()) {
            const ops = tryParseDrawOps(accumulated);
            if (ops) {
              for (const op of ops) {
                controller.enqueue(toSSE({ type: 'draw_op', data: op }));
              }
            }
          }
          controller.enqueue(toSSE({ type: 'done' }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream interrupted';
          controller.enqueue(writeError('STREAM_ERROR', msg));
        } finally {
          controller.close();
        }
      },
      cancel() {
        stream.controller.abort();
      },
    });

    return new Response(readable, { headers: sseHeaders(requestId) });
  } catch (err) {
    return handleOpenAIError(err);
  }
}

/** Try to parse accumulated text as a JSON array of draw operations. */
function tryParseDrawOps(text: string): Record<string, unknown>[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    return null;
  } catch {
    return null;
  }
}
