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
