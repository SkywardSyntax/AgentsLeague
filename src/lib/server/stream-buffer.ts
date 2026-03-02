/**
 * Caps a stream text buffer to prevent unbounded growth.
 * When the buffer would exceed MAX_STREAM_BUFFER after appending `incoming`,
 * the front is truncated to keep the most recent content.
 */
export const MAX_STREAM_BUFFER = 100_000;

export interface BufferAppendResult {
  buffer: string;
  truncated: boolean;
}

export function appendToStreamBuffer(
  current: string,
  incoming: string,
): BufferAppendResult {
  const combined = current + incoming;
  if (combined.length <= MAX_STREAM_BUFFER) {
    return { buffer: combined, truncated: false };
  }
  // Keep the most recent half of the max size
  const keep = Math.floor(MAX_STREAM_BUFFER / 2);
  return { buffer: combined.slice(-keep), truncated: true };
}
