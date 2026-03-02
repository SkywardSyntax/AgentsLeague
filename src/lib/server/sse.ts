import type { AgentSSEEvent } from '@/types/agent';

/** Returns HTTP headers for a Server-Sent Events response (text/event-stream, no-cache, keep-alive). */
export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };
}

/**
 * Serialize `payload` as a single SSE frame: `data: <JSON>\n\n`.
 * The double newline terminates the event per the SSE specification.
 */
export function formatSSE(payload: AgentSSEEvent): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Create a typed send helper bound to a ReadableStream controller.
 * Ensures every SSE payload is a valid AgentSSEEvent at compile time.
 */
export function createSSESender(controller: ReadableStreamDefaultController<Uint8Array>) {
  const encoder = new TextEncoder();
  return (payload: AgentSSEEvent) => {
    controller.enqueue(encoder.encode(formatSSE(payload)));
  };
}

export function formatSSEComment(text: string): string {
  return `: ${text}\n\n`;
}
