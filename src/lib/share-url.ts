/**
 * Share-URL encoding utilities.
 *
 * Compresses whiteboard scene JSON for shorter share URLs using the
 * browser CompressionStream API (gzip).  Falls back to plain base64
 * when CompressionStream is unavailable (e.g. older browsers, SSR).
 *
 * Wire format:
 *   byte 0 = 0x01  →  gzip-compressed payload follows
 *   byte 0 = 0x00  →  raw JSON (legacy / fallback)
 *   anything else   →  treat as legacy uncompressed base64
 */

// ─── Header bytes ────────────────────────────────────────────────────────────

const HEADER_COMPRESSED = 0x01;
const HEADER_RAW = 0x00;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function supportsCompressionStream(): boolean {
  return (
    typeof CompressionStream !== 'undefined' &&
    typeof DecompressionStream !== 'undefined'
  );
}

/** Encode a Uint8Array to URL-safe base64. */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Decode URL-safe base64 to Uint8Array. */
function base64ToUint8(b64: string): Uint8Array {
  // Restore standard base64 characters
  const standard = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Compress / Decompress via CompressionStream ─────────────────────────────

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLength = 0;
  for (const c of chunks) totalLength += c.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLength = 0;
  for (const c of chunks) totalLength += c.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compress a JSON string into a URL-safe base64 token.
 * Uses gzip when available; otherwise falls back to raw base64.
 */
export async function compressShareData(json: string): Promise<string> {
  const encoder = new TextEncoder();
  const raw = encoder.encode(json);

  if (supportsCompressionStream()) {
    try {
      const compressed = await gzipCompress(raw);
      // Prepend header byte
      const payload = new Uint8Array(1 + compressed.length);
      payload[0] = HEADER_COMPRESSED;
      payload.set(compressed, 1);
      return uint8ToBase64(payload);
    } catch {
      // Fall through to raw encoding
    }
  }

  // Fallback: raw encoding with header byte
  const payload = new Uint8Array(1 + raw.length);
  payload[0] = HEADER_RAW;
  payload.set(raw, 1);
  return uint8ToBase64(payload);
}

/**
 * Decompress a share token back to JSON.
 * Auto-detects compressed vs uncompressed by the header byte.
 * Also handles legacy tokens that lack a header (plain btoa output).
 */
export async function decompressShareData(token: string): Promise<string> {
  const decoder = new TextDecoder();

  // Try decoding as our format (with header byte)
  let bytes: Uint8Array;
  try {
    bytes = base64ToUint8(token);
  } catch {
    // If base64 decode fails, try legacy btoa directly
    return atob(token);
  }

  if (bytes.length === 0) {
    return '';
  }

  const header = bytes[0];

  if (header === HEADER_COMPRESSED) {
    const compressed = bytes.slice(1);
    const decompressed = await gzipDecompress(compressed);
    return decoder.decode(decompressed);
  }

  if (header === HEADER_RAW) {
    return decoder.decode(bytes.slice(1));
  }

  // Legacy format: no header byte — entire payload is the JSON
  // Try to interpret as UTF-8 first
  const text = decoder.decode(bytes);
  // Validate it looks like JSON
  if (text.startsWith('[') || text.startsWith('{')) {
    return text;
  }

  // Last resort: assume it was plain btoa-encoded JSON (legacy)
  return atob(token);
}
