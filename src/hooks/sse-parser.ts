/**
 * Pure SSE (Server-Sent Events) buffer parser.
 * Single canonical location for all SSE parsing utilities.
 */
export interface SSEParseResult {
  events: unknown[];
  remaining: string;
  errors: string[];
}

/**
 * Parses an SSE text buffer into discrete events.
 *
 * - Splits on double-newline boundaries (\r\n\r\n or \n\n).
 * - Ignores comment lines (starting with `:`) and `event:` prefix lines.
 * - Concatenates multiple `data:` lines within a single event with `\n`.
 * - Skips `data: [DONE]` sentinel.
 * - Returns parsed JSON events, leftover buffer, and any parse errors.
 */
export function parseSSEBuffer(buffer: string): SSEParseResult {
  const events: unknown[] = [];
  const errors: string[] = [];

  const parts = buffer.split(/\r?\n\r?\n/);
  if (parts.length <= 1) {
    return { events, remaining: buffer, errors };
  }

  const remaining = parts.pop() ?? '';

  for (const chunk of parts) {
    const lines = chunk.split(/\r?\n/);
    const dataLines: string[] = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // SSE comment lines
      if (line.startsWith(':')) continue;
      // event: prefix lines (ignored for data extraction)
      if (line.startsWith('event:')) continue;
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) continue;

    const joined = dataLines.join('\n');
    if (!joined) continue;
    if (joined === '[DONE]') continue;

    try {
      events.push(JSON.parse(joined));
    } catch {
      errors.push(`Invalid SSE JSON: ${joined.slice(0, 120)}`);
    }
  }

  return { events, remaining, errors };
}

/**
 * Lightweight SSE frame parser that treats each `data:` line independently.
 * Unlike parseSSEBuffer, does not join multi-data-line events or filter
 * comments / `event:` prefixes / `[DONE]` sentinels.
 */
export function parseSSEFrames(
  buffer: string,
): { events: unknown[]; remaining: string; errors: string[] } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const remaining = parts.pop() ?? '';
  const events: unknown[] = [];
  const errors: string[] = [];
  for (const chunk of parts) {
    for (const line of chunk.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('data:'))) {
      const json = line.slice(5).trim();
      if (!json) continue;
      try { events.push(JSON.parse(json)); }
      catch { errors.push('Invalid SSE JSON payload received'); }
    }
  }
  return { events, remaining, errors };
}
