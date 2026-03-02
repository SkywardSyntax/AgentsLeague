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

const REDACTED_KEYS = new Set([
  'userMessage',
  'user_message',
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
]);

function redactSensitiveFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (REDACTED_KEYS.has(key)) {
      result[key] =
        typeof value === 'string' ? `[REDACTED length=${value.length}]` : '[REDACTED]';
    } else {
      result[key] = value;
    }
  }
  return result;
}
