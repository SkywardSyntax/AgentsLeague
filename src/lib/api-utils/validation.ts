/**
 * Request validation utilities for API routes.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

// ── Shared Schemas ─────────────────────────────────────────

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(32_000),
});

export const DrawRequestSchema = z.object({
  userMessage: z.string().min(1).max(4_000),
  conversationHistory: z.array(MessageSchema).max(50).default([]),
});
export type DrawRequest = z.infer<typeof DrawRequestSchema>;

export const ChatRequestSchema = z.object({
  userMessage: z.string().min(1).max(4_000),
  conversationHistory: z.array(MessageSchema).max(100).default([]),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ── Validation Helper ──────────────────────────────────────

export interface ValidationSuccess<T> { data: T }
export interface ValidationError { error: NextResponse }
export type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

export async function validateBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<ValidationResult<T>> {
  try {
    const json: unknown = await req.json();
    const data = schema.parse(json);
    return { data };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        error: NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: err.issues.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 },
        ),
      };
    }
    return {
      error: NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Malformed JSON' },
        { status: 400 },
      ),
    };
  }
}

// ── Error Response Helpers ─────────────────────────────────

export function errorResponse(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: code, message, ...extra }, { status });
}

export function handleOpenAIError(err: unknown): NextResponse {
  // OpenAI SDK v6 error handling
  if (err != null && typeof err === 'object' && 'status' in err) {
    const apiErr = err as { status: number; message: string };
    switch (apiErr.status) {
      case 401:
        return errorResponse('OPENAI_AUTH_ERROR', 'Upstream authentication failed', 502);
      case 429:
        return errorResponse(
          'OPENAI_RATE_LIMIT',
          'AI service rate limit — please retry shortly',
          429,
          { retryAfter: 10 },
        );
      case 500:
      case 503:
        return errorResponse('OPENAI_OVERLOADED', 'AI service temporarily unavailable', 503, {
          retryAfter: 30,
        });
      default:
        return errorResponse('INTERNAL_ERROR', `Upstream error: ${apiErr.message}`, 502);
    }
  }

  if (err instanceof Error && err.name === 'AbortError') {
    return errorResponse('OPENAI_TIMEOUT', 'Request timed out', 504);
  }

  return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
}
