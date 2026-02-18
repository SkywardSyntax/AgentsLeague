/**
 * Streaming utilities for OpenAI Responses API draw tool calls.
 *
 * - parseDrawToolCall()  — extract & validate tool arguments
 * - handleToolResult()   — build compact result for conversation history
 * - retry helpers with exponential backoff for 429 / 5xx
 *
 * Reference: openai-whiteboard-integration-plan.md §3, §5
 */

import { DrawToolArgsSchema, type DrawToolArgs, type DrawToolElement } from './tools';

// ── Error types ─────────────────────────────────────────────────────

export class DrawingError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
    public readonly code = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'DrawingError';
  }
}

// ── Parse draw tool call ────────────────────────────────────────────

export interface ParsedDrawCall {
  args: DrawToolArgs;
  elementCount: number;
  elementIds: string[];
}

/**
 * Parse and validate the JSON arguments from a draw() function call.
 * Throws DrawingError on invalid input.
 */
export function parseDrawToolCall(rawArguments: string): ParsedDrawCall {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    throw new DrawingError('Invalid JSON in draw tool arguments', true, 'INVALID_JSON');
  }

  const result = DrawToolArgsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new DrawingError(`Invalid draw spec: ${issues}`, true, 'INVALID_SPEC');
  }

  const args = result.data;
  validateSpec(args);

  return {
    args,
    elementCount: args.elements.length,
    elementIds: args.elements.map((el) => el.id),
  };
}

// ── Spec validation (beyond schema) ─────────────────────────────────

function validateSpec(spec: DrawToolArgs): void {
  const { canvas, elements } = spec;

  if (canvas.width > 7680 || canvas.height > 4320) {
    throw new DrawingError('Canvas too large (max 7680×4320)', false, 'INVALID_SPEC');
  }

  const seenIds = new Set<string>();
  for (const el of elements) {
    if (seenIds.has(el.id)) {
      throw new DrawingError(`Duplicate element ID: ${el.id}`, true, 'INVALID_SPEC');
    }
    seenIds.add(el.id);

    if (Math.abs(el.x) > 10000 || Math.abs(el.y) > 10000) {
      throw new DrawingError(`Element ${el.id} out of bounds`, true, 'INVALID_SPEC');
    }

    if (['line', 'arrow', 'path'].includes(el.type)) {
      if (!el.points || el.points.length < 2) {
        throw new DrawingError(`${el.type} '${el.id}' needs ≥2 points`, true, 'INVALID_SPEC');
      }
    }

    if (el.type === 'text' && !el.text) {
      throw new DrawingError(`Text element '${el.id}' has no text content`, true, 'INVALID_SPEC');
    }

    if (el.type === 'group' && (!el.children || el.children.length === 0)) {
      throw new DrawingError(`Group '${el.id}' has no children`, true, 'INVALID_SPEC');
    }
  }
}

// ── Compact tool result ─────────────────────────────────────────────

export interface ToolResult {
  status: 'rendered';
  elements_count: number;
  bbox: { x: number; y: number; w: number; h: number };
  last_ids: string[];
}

/** Build a compact result for the conversation history. */
export function handleToolResult(args: DrawToolArgs): ToolResult {
  const elements = args.elements;
  const bbox = computeBBox(elements);
  const lastIds = elements.slice(-5).map((el) => el.id);

  return {
    status: 'rendered',
    elements_count: elements.length,
    bbox,
    last_ids: lastIds,
  };
}

function computeBBox(elements: DrawToolElement[]): ToolResult['bbox'] {
  if (elements.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const x = el.x;
    const y = el.y;
    const w = el.width ?? 0;
    const h = el.height ?? 0;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

// ── Partial JSON parsing for streaming ──────────────────────────────

/**
 * Extract fully-formed element objects from a partial JSON buffer
 * as it streams in, so elements can render before the full response.
 */
export function tryParsePartialElements(buffer: string): DrawToolElement[] | null {
  try {
    const idx = buffer.indexOf('"elements"');
    if (idx === -1) return null;

    const arrStart = buffer.indexOf('[', idx);
    if (arrStart === -1) return null;

    const elements: DrawToolElement[] = [];
    let depth = 0;
    let objStart: number | null = null;

    for (let i = arrStart + 1; i < buffer.length; i++) {
      if (buffer[i] === '{') {
        if (depth === 0) objStart = i;
        depth++;
      } else if (buffer[i] === '}') {
        depth--;
        if (depth === 0 && objStart !== null) {
          try {
            const el = JSON.parse(buffer.slice(objStart, i + 1));
            if (el.id && el.type) {
              elements.push(el as DrawToolElement);
            }
          } catch {
            // incomplete object, skip
          }
          objStart = null;
        }
      }
    }

    return elements.length > 0 ? elements : null;
  } catch {
    return null;
  }
}

// ── Retry with exponential backoff ──────────────────────────────────

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 20000,
};

/**
 * Retry an async operation with exponential backoff.
 * Retries on 429 (rate limit) and 5xx server errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {},
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY, ...opts };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isRetryableError(lastError)) {
        throw lastError;
      }

      if (attempt < maxAttempts - 1) {
        const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        await sleep(delay);
      }
    }
  }

  throw new DrawingError(
    `Exhausted ${maxAttempts} retry attempts: ${lastError?.message}`,
    false,
    'RETRY_EXHAUSTED',
  );
}

function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  // Rate limit (429)
  if (msg.includes('rate limit') || msg.includes('429')) return true;
  // Server errors (5xx)
  if (/\b5\d{2}\b/.test(msg)) return true;
  // Timeout
  if (msg.includes('timeout') || msg.includes('timed out')) return true;
  // Connection error
  if (msg.includes('connection') || msg.includes('econnrefused')) return true;
  // DrawingError with retryable flag
  if (err instanceof DrawingError) return err.retryable;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Error mapping for frontend ──────────────────────────────────────

export interface ErrorResponse {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export function mapErrorToResponse(err: unknown, attempt = 0): ErrorResponse {
  if (err instanceof DrawingError) {
    return {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      retryAfterMs: err.retryable ? 1000 * 2 ** attempt : undefined,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const msg = message.toLowerCase();

  if (msg.includes('rate limit') || msg.includes('429')) {
    return { code: 'RATE_LIMITED', message: 'Too many requests. Retrying…', retryable: true, retryAfterMs: 5000 * 2 ** attempt };
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return { code: 'TIMEOUT', message: 'Request timed out. Retrying…', retryable: true, retryAfterMs: 2000 };
  }
  if (/\b5\d{2}\b/.test(msg)) {
    return { code: 'SERVER_ERROR', message: 'OpenAI is down. Retrying…', retryable: true, retryAfterMs: 3000 * 2 ** attempt };
  }

  return { code: 'BAD_REQUEST', message, retryable: false };
}
