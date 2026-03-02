export interface ChunkCoalescer {
  push(event: { type: string; delta?: string; [key: string]: unknown }): void;
  flush(): string | null;
  pendingLength(): number;
  destroy(): void;
  onFlush(handler: (text: string) => void): void;
  onPassthrough(handler: (event: { type: string; [key: string]: unknown }) => void): void;
}

export function createChunkCoalescer(opts?: {
  maxBufferChars?: number;
}): ChunkCoalescer {
  const maxBufferChars = opts?.maxBufferChars ?? Infinity;
  let buffer = '';
  let flushHandler: ((text: string) => void) | null = null;
  let passthroughHandler: ((event: { type: string; [key: string]: unknown }) => void) | null = null;

  function doFlush(): string | null {
    if (buffer.length === 0) return null;
    const text = buffer;
    buffer = '';
    if (flushHandler) flushHandler(text);
    return text;
  }

  return {
    push(event) {
      if (event.type === 'assistant.text.delta' && typeof event.delta === 'string') {
        buffer += event.delta;
        if (buffer.length >= maxBufferChars) {
          doFlush();
        }
      } else {
        // Non-text events pass through immediately
        if (passthroughHandler) passthroughHandler(event);
      }
    },

    flush(): string | null {
      return doFlush();
    },

    pendingLength(): number {
      return buffer.length;
    },

    destroy(): void {
      doFlush();
      flushHandler = null;
      passthroughHandler = null;
    },

    onFlush(handler) {
      flushHandler = handler;
    },

    onPassthrough(handler) {
      passthroughHandler = handler;
    },
  };
}
