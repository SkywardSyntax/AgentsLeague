/**
 * Request/response logging and API usage monitoring.
 *
 * Logs request metadata, latency, token usage, and errors
 * to the console with structured JSON for debugging.
 */

// ── Types ───────────────────────────────────────────────────────────

interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  startTime: number;
  ip: string;
}

interface ResponseLog {
  requestId: string;
  status: number;
  durationMs: number;
  cached: boolean;
  tokens?: { prompt?: number; completion?: number; total?: number } | undefined;
}

// ── In-flight tracking ──────────────────────────────────────────────

const inFlightRequests = new Map<string, RequestLog>();

// ── Usage stats ─────────────────────────────────────────────────────

interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  avgLatencyMs: number;
  latencies: number[];
}

const stats: UsageStats = {
  totalRequests: 0,
  totalTokens: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: 0,
  avgLatencyMs: 0,
  latencies: [],
};

const MAX_LATENCY_SAMPLES = 200;

// ── Logging functions ───────────────────────────────────────────────

export function logRequest(requestId: string, request: Request, path: string): void {
  const log: RequestLog = {
    requestId,
    method: request.method,
    path,
    startTime: Date.now(),
    ip: request.headers.get('x-forwarded-for') ?? 'unknown',
  };
  inFlightRequests.set(requestId, log);
  stats.totalRequests++;

  if (process.env.LOG_OPENAI_REQUESTS === 'true') {
    console.log(
      '[API:REQ]',
      JSON.stringify({
        id: requestId,
        method: log.method,
        path: log.path,
        ip: log.ip,
      })
    );
  }
}

export function logResponse(
  requestId: string,
  status: number,
  options: { cached?: boolean; tokens?: ResponseLog['tokens'] } = {}
): void {
  const reqLog = inFlightRequests.get(requestId);
  const durationMs = reqLog ? Date.now() - reqLog.startTime : 0;
  inFlightRequests.delete(requestId);

  if (options.cached) {
    stats.cacheHits++;
  } else {
    stats.cacheMisses++;
  }

  if (options.tokens?.total) {
    stats.totalTokens += options.tokens.total;
  }

  if (status >= 400) {
    stats.errors++;
  }

  // Track latency
  stats.latencies.push(durationMs);
  if (stats.latencies.length > MAX_LATENCY_SAMPLES) {
    stats.latencies.shift();
  }
  stats.avgLatencyMs = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;

  const log: ResponseLog = {
    requestId,
    status,
    durationMs,
    cached: options.cached ?? false,
    tokens: options.tokens,
  };

  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';
  console[level]('[API:RES]', JSON.stringify(log));
}

export function logError(requestId: string, error: unknown): void {
  stats.errors++;
  console.error(
    '[API:ERR]',
    JSON.stringify({
      id: requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' ') : undefined,
    })
  );
}

// ── Usage stats accessor ────────────────────────────────────────────

export function getUsageStats(): Readonly<Omit<UsageStats, 'latencies'>> & {
  p95LatencyMs: number;
} {
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  return {
    totalRequests: stats.totalRequests,
    totalTokens: stats.totalTokens,
    cacheHits: stats.cacheHits,
    cacheMisses: stats.cacheMisses,
    errors: stats.errors,
    avgLatencyMs: Math.round(stats.avgLatencyMs),
    p95LatencyMs: sorted[p95Index] ?? 0,
  };
}
