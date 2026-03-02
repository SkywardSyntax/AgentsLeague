export const BODY_LIMITS = {
  AGENT_STREAM: 512 * 1024,   // 512KB — generous for 100-message history
  LATEX_SVG: 16 * 1024,        // 16KB — TeX expressions are short
  DEFAULT: 256 * 1024,         // 256KB — safe default
} as const;

export class PayloadTooLargeError extends Error {
  readonly status = 413;
  readonly code = 'PAYLOAD_TOO_LARGE';
  constructor(
    readonly limit: number,
    readonly actual: number,
  ) {
    super(`Request body exceeds maximum size of ${Math.round(limit / 1024)}KB`);
    this.name = 'PayloadTooLargeError';
  }
}

export async function parseJsonWithLimit(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declared = parseInt(contentLength, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new PayloadTooLargeError(maxBytes, declared);
    }
  }

  // Stream-read the body with a byte counter for cases without Content-Length
  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error('Request has no body');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel();
      throw new PayloadTooLargeError(maxBytes, totalBytes);
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(combined);
  return JSON.parse(text);
}
