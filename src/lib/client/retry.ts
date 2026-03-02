export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, maxRetries: number) => void;
  /** When set, concurrent calls with the same key return the same buffered result. */
  dedupeKey?: string;
}

/**
 * Delay that races against an AbortSignal.
 * Resolves after `ms` or rejects with AbortError if the signal fires first.
 */
function abortableDelay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** In-flight dedup registry: key → Promise<{status, headers, body}> */
const inflightRequests = new Map<string, Promise<{ status: number; headers: [string, string][]; body: ArrayBuffer }>>();

/**
 * Fetch with exponential backoff + jitter.
 * - Retries on retryable HTTP statuses (default: 429, 502, 503).
 * - Retries on network errors (fetch throws).
 * - Respects `Retry-After` header when present.
 * - Honors AbortSignal — aborts immediately, no further retries.
 * - Optional `dedupeKey` deduplicates concurrent identical requests.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = {},
): Promise<Response> {
  const { dedupeKey } = config;

  if (dedupeKey) {
    const existing = inflightRequests.get(dedupeKey);
    if (existing) {
      const snapshot = await existing;
      return new Response(snapshot.body, { status: snapshot.status, headers: snapshot.headers });
    }

    const promise = fetchWithRetryCore(url, options, config).then(async (res) => {
      const body = await res.arrayBuffer();
      const headers: [string, string][] = [];
      res.headers.forEach((v, k) => headers.push([k, v]));
      return { status: res.status, headers, body };
    });

    inflightRequests.set(dedupeKey, promise);

    try {
      const snapshot = await promise;
      return new Response(snapshot.body, { status: snapshot.status, headers: snapshot.headers });
    } finally {
      inflightRequests.delete(dedupeKey);
    }
  }

  return fetchWithRetryCore(url, options, config);
}

/** @internal visible for testing dedup map cleanup */
export function _getInflightRequests() {
  return inflightRequests;
}

async function fetchWithRetryCore(
  url: string,
  options: RequestInit,
  config: RetryConfig,
): Promise<Response> {
  const {
    maxRetries = 2,
    baseDelayMs = 1000,
    retryableStatuses = [429, 502, 503],
    onRetry,
  } = config;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.ok || !retryableStatuses.includes(res.status) || attempt === maxRetries) {
        return res;
      }

      // Calculate delay with exponential backoff + jitter
      let delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;

      // Respect Retry-After header (seconds)
      const retryAfter = res.headers.get('Retry-After');
      if (retryAfter) {
        const secs = parseInt(retryAfter, 10);
        if (!isNaN(secs) && secs > 0) {
          delayMs = secs * 1000;
        }
      }

      onRetry?.(attempt + 1, maxRetries);
      await abortableDelay(delayMs, options.signal as AbortSignal | null);
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      if (attempt === maxRetries) throw error;

      lastError = error instanceof Error ? error : new Error(String(error));
      onRetry?.(attempt + 1, maxRetries);

      const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      await abortableDelay(delayMs, options.signal as AbortSignal | null);
    }
  }

  throw lastError ?? new Error('fetchWithRetry: exhausted retries');
}
