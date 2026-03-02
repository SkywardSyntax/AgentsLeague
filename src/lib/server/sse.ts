export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };
}

export interface FormatSSEOptions {
  id?: number;
  event?: string;
}

export function formatSSE(payload: unknown, opts?: FormatSSEOptions): string {
  let result = '';
  if (opts?.id != null) result += `id: ${opts.id}\n`;
  if (opts?.event) result += `event: ${opts.event}\n`;
  result += `data: ${JSON.stringify(payload)}\n\n`;
  return result;
}

export function formatSSEError(code: string, message: string, requestId?: string): string {
  return formatSSE({ code, message, ...(requestId ? { requestId } : {}) }, { event: 'error' });
}

export function createEventCounter(): { next(): number } {
  let counter = 0;
  return { next: () => counter++ };
}

export function createSSEHeartbeat(
  controller: ReadableStreamDefaultController<Uint8Array>,
  intervalMs = 15_000,
): { stop(): void } {
  const encoder = new TextEncoder();
  const id = setInterval(() => {
    try {
      controller.enqueue(encoder.encode(':heartbeat\n\n'));
    } catch {
      // controller may be closed
      clearInterval(id);
    }
  }, intervalMs);

  return {
    stop() {
      clearInterval(id);
    },
  };
}

/** Safely enqueue data to a stream controller. Returns false if the controller is closed. */
export function safeEnqueue(
  controller: ReadableStreamDefaultController<Uint8Array>,
  data: string,
  encoder: TextEncoder,
): boolean {
  try {
    controller.enqueue(encoder.encode(data));
    return true;
  } catch {
    return false;
  }
}
