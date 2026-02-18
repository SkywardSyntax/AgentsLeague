/**
 * SSE streaming utilities for API routes.
 */

const encoder = new TextEncoder();

/** Format data as an SSE `data:` frame. */
export function toSSE(data: unknown): Uint8Array {
  const payload = JSON.stringify(data);
  return encoder.encode(`data: ${payload}\n\n`);
}

/** Write an error as an SSE frame. */
export function writeError(code: string, message: string): Uint8Array {
  return toSSE({ type: 'error', code, message });
}

/** Create an AbortSignal that fires after `timeoutMs`. */
export function createAbortSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

/** SSE response headers. */
export function sseHeaders(requestId?: string): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
  };
}
