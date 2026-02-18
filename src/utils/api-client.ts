/**
 * Client-side API optimization utilities.
 *
 * - Debounce rapid canvas changes before API calls
 * - Request deduplication (abort duplicate in-flight requests)
 * - Prefetch next likely requests
 * - API usage & latency monitoring in console
 */

// ── Debounce ────────────────────────────────────────────────────────

/** Debounce a function with configurable delay. Trailing-edge by default. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): ((...args: Args) => void) & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | null = null;

  const debounced = ((...args: Args) => {
    lastArgs = args;
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
      lastArgs = null;
    }, delayMs);
  }) as ((...args: Args) => void) & { cancel: () => void; flush: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timeoutId !== null && lastArgs !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  return debounced;
}

// ── Request deduplication ───────────────────────────────────────────

interface InFlightRequest {
  controller: AbortController;
  promise: Promise<Response>;
}

const inFlightRequests = new Map<string, InFlightRequest>();

/**
 * Deduplicated fetch: aborts any existing in-flight request with the
 * same key before starting a new one. Returns the response.
 */
export async function deduplicatedFetch(
  key: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  // Abort existing request with same key
  const existing = inFlightRequests.get(key);
  if (existing) {
    existing.controller.abort();
    inFlightRequests.delete(key);
  }

  const controller = new AbortController();
  const mergedSignal = init?.signal
    ? mergeAbortSignals(init.signal, controller.signal)
    : controller.signal;

  const fetchInit: RequestInit = {
    ...init,
    signal: mergedSignal,
  };

  const promise = fetch(url, fetchInit).finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, { controller, promise });
  return promise;
}

function mergeAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/** Cancel all in-flight deduplicated requests. */
export function cancelAllInFlight(): void {
  for (const [, req] of inFlightRequests) {
    req.controller.abort();
  }
  inFlightRequests.clear();
}

// ── Prefetch ────────────────────────────────────────────────────────

const prefetchCache = new Map<string, { response: Response; expiresAt: number }>();
const PREFETCH_TTL_MS = 30_000;

/**
 * Prefetch a request and cache the response.
 * Subsequent fetches to the same URL will use the cached response.
 */
export async function prefetch(url: string, init?: RequestInit): Promise<void> {
  if (prefetchCache.has(url)) return;

  try {
    const response = await fetch(url, { ...init, priority: 'low' as RequestPriority });
    if (response.ok) {
      prefetchCache.set(url, {
        response: response.clone(),
        expiresAt: Date.now() + PREFETCH_TTL_MS,
      });
    }
  } catch {
    // Prefetch failures are non-critical
  }
}

/** Get a prefetched response if available and not expired. */
export function getPrefetched(url: string): Response | null {
  const entry = prefetchCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    prefetchCache.delete(url);
    return null;
  }
  prefetchCache.delete(url); // consume once
  return entry.response.clone();
}

// ── Client-side API monitor ─────────────────────────────────────────

interface APIMetrics {
  requests: number;
  errors: number;
  avgLatencyMs: number;
  latencies: number[];
}

const clientMetrics: APIMetrics = {
  requests: 0,
  errors: 0,
  avgLatencyMs: 0,
  latencies: [],
};

const MAX_SAMPLES = 100;

/**
 * Wrap a fetch call with latency monitoring.
 * Logs request timing to console and tracks metrics.
 */
export async function monitoredFetch(url: string, init?: RequestInit): Promise<Response> {
  const start = performance.now();
  clientMetrics.requests++;

  try {
    const response = await fetch(url, init);
    const latency = performance.now() - start;

    clientMetrics.latencies.push(latency);
    if (clientMetrics.latencies.length > MAX_SAMPLES) {
      clientMetrics.latencies.shift();
    }
    clientMetrics.avgLatencyMs =
      clientMetrics.latencies.reduce((a, b) => a + b, 0) / clientMetrics.latencies.length;

    if (!response.ok) clientMetrics.errors++;

    console.debug(
      `[API] ${init?.method ?? 'GET'} ${url} → ${response.status} (${latency.toFixed(0)}ms)`
    );

    return response;
  } catch (err) {
    clientMetrics.errors++;
    const latency = performance.now() - start;
    console.debug(`[API] ${init?.method ?? 'GET'} ${url} → FAILED (${latency.toFixed(0)}ms)`);
    throw err;
  }
}

/** Get client-side API metrics snapshot. */
export function getClientAPIMetrics(): Readonly<Omit<APIMetrics, 'latencies'>> & {
  p95LatencyMs: number;
} {
  const sorted = [...clientMetrics.latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  return {
    requests: clientMetrics.requests,
    errors: clientMetrics.errors,
    avgLatencyMs: Math.round(clientMetrics.avgLatencyMs),
    p95LatencyMs: Math.round(sorted[p95Index] ?? 0),
  };
}

/** Log current API metrics to console. */
export function logAPIMetrics(): void {
  const m = getClientAPIMetrics();
  console.table({
    'Total Requests': m.requests,
    Errors: m.errors,
    'Avg Latency (ms)': m.avgLatencyMs,
    'P95 Latency (ms)': m.p95LatencyMs,
  });
}
