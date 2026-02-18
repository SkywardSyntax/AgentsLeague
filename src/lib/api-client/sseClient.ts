/**
 * SSE client for streaming draw operations from /api/draw.
 *
 * Parses Server-Sent Events, validates payloads with Zod,
 * and yields typed DrawEvents as an AsyncIterable.
 */

import { z } from 'zod';
import { DrawOpSchema } from '@/lib/schema';
import type { DrawOp } from '@/types';

// ── DrawEvent types ─────────────────────────────────────────────────

export interface DrawOpEvent {
  readonly type: 'draw_op';
  readonly data: DrawOp;
}

export interface StepProgressEvent {
  readonly type: 'step_progress';
  readonly step: string;
  readonly summary: string;
}

export interface DoneEvent {
  readonly type: 'done';
}

export interface ErrorEvent {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
}

export type DrawEvent = DrawOpEvent | StepProgressEvent | DoneEvent | ErrorEvent;

// ── Zod validation schemas ──────────────────────────────────────────

const DrawOpEventSchema = z.object({
  type: z.literal('draw_op'),
  data: DrawOpSchema,
});

const StepProgressEventSchema = z.object({
  type: z.literal('step_progress'),
  step: z.string(),
  summary: z.string(),
});

const DoneEventSchema = z.object({ type: z.literal('done') });

const ErrorEventSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

const DrawEventSchema = z.discriminatedUnion('type', [
  DrawOpEventSchema,
  StepProgressEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
]);

// ── Conversation message type ───────────────────────────────────────

export interface ConversationMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

// ── Retry configuration ─────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3). */
  readonly maxRetries: number;
  /** Initial backoff delay in ms (default: 1000). */
  readonly baseDelayMs: number;
  /** Maximum backoff delay in ms (default: 10000). */
  readonly maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
};

export interface ConnectOptions {
  /** SSE endpoint URL (default: '/api/draw'). */
  readonly endpoint?: string;
  /** AbortController signal for cancellation. */
  readonly signal?: AbortSignal;
  /** Retry configuration. */
  readonly retry?: Partial<RetryConfig>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function logError(context: string, error: unknown): void {
  console.error(`[sseClient] ${context}:`, error);
}

/** Calculate exponential backoff with jitter. */
function backoffDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);
  // Add ±25% jitter
  return capped * (0.75 + Math.random() * 0.5);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Parse a single SSE data payload into a validated DrawEvent. */
function parseSSEData(raw: string): DrawEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logError('JSON parse failed', raw);
    return null;
  }

  const result = DrawEventSchema.safeParse(parsed);
  if (!result.success) {
    logError('Event validation failed', result.error.issues);
    return null;
  }
  return result.data as DrawEvent;
}

// ── Core: response stream → AsyncIterable<DrawEvent> ────────────────

async function* iterateSSEResponse(
  response: Response,
): AsyncIterable<DrawEvent> {
  const body = response.body;
  if (!body) {
    throw new Error('Response body is null');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep last (possibly incomplete) line in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '' || data === '[DONE]') continue;

        const event = parseSSEData(data);
        if (event) yield event;
      }
    }

    // Flush remaining buffer
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim();
      if (data && data !== '[DONE]') {
        const event = parseSSEData(data);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Connect to the /api/draw SSE endpoint and yield validated DrawEvents.
 *
 * Automatically retries on connection errors with exponential backoff.
 * Supports cancellation via AbortController signal.
 *
 * @example
 * ```ts
 * const abort = new AbortController();
 * for await (const event of connectToDrawStream('Draw a house', [], { signal: abort.signal })) {
 *   if (event.type === 'draw_op') controller.push(event.data);
 *   if (event.type === 'done') break;
 * }
 * ```
 */
export async function* connectToDrawStream(
  userMessage: string,
  conversationHistory: ConversationMessage[] = [],
  options: ConnectOptions = {},
): AsyncGenerator<DrawEvent, void, undefined> {
  const {
    endpoint = '/api/draw',
    signal,
    retry: retryOpts,
  } = options;

  const retryConfig: RetryConfig = { ...DEFAULT_RETRY, ...retryOpts };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    // Backoff before retry (skip on first attempt)
    if (attempt > 0) {
      const delay = backoffDelay(attempt - 1, retryConfig);
      logError(`Retry ${attempt}/${retryConfig.maxRetries}`, `waiting ${Math.round(delay)}ms`);
      await sleep(delay, signal);
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage, conversationHistory }),
        signal: signal ?? null,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') throw lastError;
      logError(`Connection failed (attempt ${attempt + 1})`, lastError.message);
      continue;
    }

    if (!response.ok) {
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      logError(`HTTP error (attempt ${attempt + 1})`, lastError.message);
      // Don't retry 4xx client errors (except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        yield {
          type: 'error',
          code: `HTTP_${response.status}`,
          message: lastError.message,
        };
        return;
      }
      continue;
    }

    // Stream connected — yield events
    try {
      yield* iterateSSEResponse(response);
      return; // Successful completion
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') throw lastError;
      logError(`Stream interrupted (attempt ${attempt + 1})`, lastError.message);
      // Fall through to retry
    }
  }

  // All retries exhausted
  yield {
    type: 'error',
    code: 'CONNECTION_FAILED',
    message: lastError?.message ?? 'Failed to connect after retries',
  };
}

/**
 * Feed a DrawEvent stream into a StreamingDrawController for incremental rendering.
 *
 * @example
 * ```ts
 * const controller = new StreamingDrawController(callbacks);
 * await feedDrawStream(connectToDrawStream('Draw a cat'), controller);
 * ```
 */
export async function feedDrawStream(
  stream: AsyncIterable<DrawEvent>,
  controller: { push(op: DrawOp): void; finish(): void },
  options?: {
    onProgress?: (step: string, summary: string) => void;
    onError?: (code: string, message: string) => void;
  },
): Promise<void> {
  for await (const event of stream) {
    switch (event.type) {
      case 'draw_op':
        controller.push(event.data);
        break;
      case 'step_progress':
        options?.onProgress?.(event.step, event.summary);
        break;
      case 'done':
        controller.finish();
        return;
      case 'error':
        logError(`Server error [${event.code}]`, event.message);
        options?.onError?.(event.code, event.message);
        break;
    }
  }
  // Stream ended without explicit 'done' event
  controller.finish();
}
