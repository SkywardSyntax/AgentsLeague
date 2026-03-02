export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };
}

export function formatSSE(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
