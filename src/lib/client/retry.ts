export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, maxRetries: number) => void;
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

/**
 * Fetch with exponential backoff + jitter.
 * - Retries on retryable HTTP statuses (default: 429, 502, 503).
 * - Retries on network errors (fetch throws).
 * - Respects `Retry-After` header when present.
 * - Honors AbortSignal — aborts immediately, no further retries.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = {},
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
