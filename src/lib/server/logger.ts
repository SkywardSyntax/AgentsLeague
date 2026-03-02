/**
 * Structured JSON logger for server-side stream observability.
 * Outputs one JSON object per line to console for log aggregators.
 *
 * Security: Never log raw user content — use lengths/hashes only.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface StreamLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

/**
 * Emit a structured log entry as a single JSON line.
 * All fields in `data` are merged into the output object.
 * Fields named `userMessage` are automatically redacted to length-only.
 */
export function logStreamEvent(
  level: LogLevel,
  message: string,
  data: Record<string, unknown> = {},
): void {
  const entry: StreamLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redactSensitiveFields(data),
  };

  switch (level) {
    case 'error':
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(entry));
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify(entry));
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
  }
}

const SENSITIVE_KEY_PATTERN = /^(user_?message|password|token|secret|api_?key|authorization|bearer)$/i;

const MAX_REDACT_DEPTH = 5;

function redactDeep(obj: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (seen.has(obj as object)) return '[Circular]';
  seen.add(obj as object);

  if (depth > MAX_REDACT_DEPTH) return '[MAX_DEPTH]';

  if (Array.isArray(obj)) {
    return obj.map((item) => redactDeep(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactDeep(value, depth + 1, seen);
    }
  }
  return result;
}

function redactSensitiveFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return redactDeep(data) as Record<string, unknown>;
}
