export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LOG_LEVELS) return env as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function emit(entry: LogEntry): void {
  if (LOG_LEVELS[entry.level] < LOG_LEVELS[getMinLevel()]) return;
  const out = entry.level === 'error' ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + '\n');
}

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(context?: Record<string, unknown>) {
  const base = context ?? {};

  const log = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    emit({ level, msg, ts: new Date().toISOString(), ...base, ...extra });
  };

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => log('debug', msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
  };
}

let _counter = 0;

/** Generate a short unique correlation ID for request tracing. */
export function correlationId(): string {
  const ts = Date.now().toString(36);
  const count = (++_counter).toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${count}-${rand}`;
}

/**
 * Create a child logger scoped to a specific request.
 * Extracts X-Request-Id from the request or generates a correlation ID.
 * Every log call from the returned logger includes the requestId field.
 */
export function withCorrelationId(req: Request, route?: string): { log: Logger; requestId: string } {
  const requestId = req.headers.get('X-Request-Id') || correlationId();
  const log = createLogger({ requestId, ...(route ? { route } : {}) });
  return { log, requestId };
}

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
