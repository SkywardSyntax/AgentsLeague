/**
 * POST /api/chat — Streaming chat about the whiteboard.
 *
 * Accepts { userMessage, conversationHistory } and streams SSE events:
 *   - { type: "message", data: string }
 *   - { type: "done" }
 *   - { type: "error", code, message }
 */

import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import {
  ChatRequestSchema,
  validateBody,
  errorResponse,
  handleOpenAIError,
} from '@/lib/api-utils/validation';
import { toSSE, writeError, createAbortSignal, sseHeaders } from '@/lib/api-utils/streaming';
import { rateLimit } from '@/lib/rate-limit';
import { logRequest, logResponse, logError } from '@/lib/api-logger';

export const runtime = 'nodejs';

const CHAT_SYSTEM_PROMPT = `You are a helpful assistant that can discuss the user's whiteboard. You can describe what's on the canvas, suggest improvements, and answer questions. Be concise.`;

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = rateLimit(ip, { windowMs: 60_000, max: 30 });
  if (!rl.ok) {
    return errorResponse('RATE_LIMITED', 'Too many requests', 429, {
      retryAfter: rl.retryAfter,
    });
  }

  const result = await validateBody(request, ChatRequestSchema);
  if ('error' in result) return result.error;
  const { userMessage, conversationHistory } = result.data;

  const input: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
  for (const msg of conversationHistory) {
    input.push({ role: msg.role, content: msg.content });
  }
  input.push({ role: 'user', content: userMessage });

  const requestId = randomUUID();
  logRequest(requestId, request, '/api/chat');
  const signal = createAbortSignal(30_000);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 60_000 });
    const stream = await client.responses.create(
      {
        model: process.env.OPENAI_MODEL ?? 'claude-opus-4.6-fast',
        instructions: CHAT_SYSTEM_PROMPT,
        input,
        stream: true,
        temperature: 0.7,
        max_output_tokens: 4_096,
      },
      { signal }
    );

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
            if (event.type === 'response.output_text.delta') {
              controller.enqueue(toSSE({ type: 'message', data: event.delta }));
            } else if (event.type === 'error') {
              controller.enqueue(writeError('STREAM_ERROR', event.message));
            } else if (event.type === 'response.completed') {
              const usage = event.response?.usage;
              logResponse(requestId, 200, {
                tokens: usage
                  ? {
                      prompt: usage.input_tokens,
                      completion: usage.output_tokens,
                      total: usage.total_tokens,
                    }
                  : undefined,
              });
            }
          }
          controller.enqueue(toSSE({ type: 'done' }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream interrupted';
          controller.enqueue(writeError('STREAM_ERROR', msg));
          logError(requestId, err);
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
    logError(requestId, err);
    return handleOpenAIError(err);
  }
}
