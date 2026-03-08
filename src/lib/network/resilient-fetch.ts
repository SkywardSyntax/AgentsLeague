export interface ResilientFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  circuitBreaker?: CircuitBreakerConfig;
}

export interface CircuitBreakerConfig {
  threshold?: number;
  cooldownMs?: number;
}

interface CircuitState {
  failures: number;
  openedAt: number | null;
  probing: boolean;
}

const circuitStates = new Map<string, CircuitState>();

function getCircuitState(key: string): CircuitState {
  let state = circuitStates.get(key);
  if (!state) {
    state = { failures: 0, openedAt: null, probing: false };
    circuitStates.set(key, state);
  }
  return state;
}

export function resetCircuitBreakers(): void {
  circuitStates.clear();
}

export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 10_000,
    retries = 2,
    circuitBreaker: cbConfig,
    signal: callerSignal,
    ...fetchOptions
  } = options;

  const threshold = cbConfig?.threshold ?? 5;
  const cooldownMs = cbConfig?.cooldownMs ?? 30_000;
  const circuitKey = url;

  // Respect caller's abort signal
  if (callerSignal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  // Circuit breaker check
  const circuit = getCircuitState(circuitKey);
  if (circuit.openedAt !== null) {
    const elapsed = Date.now() - circuit.openedAt;
    if (elapsed < cooldownMs) {
      throw new Error('Circuit breaker is open. Request rejected.');
    }
    // Half-open: only allow one concurrent probe request
    if (circuit.probing) {
      throw new Error('Circuit breaker is open. Request rejected.');
    }
    circuit.probing = true;
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 100ms, 200ms, 400ms, ...
      const delay = 100 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    const controller = new AbortController();

    // Wire caller signal to our controller
    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    // Set timeout
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', onCallerAbort);

      if (res.ok) {
        // Probe succeeded — reset circuit
        circuit.failures = 0;
        circuit.openedAt = null;
        circuit.probing = false;
        return res;
      }

      // Client errors (4xx) — don't retry
      if (res.status >= 400 && res.status < 500) {
        circuit.failures++;
        circuit.probing = false;
        if (circuit.failures >= threshold) {
          circuit.openedAt = Date.now();
        }
        return res;
      }

      // Server errors (5xx) — retry
      circuit.failures++;
      circuit.probing = false;
      if (circuit.failures >= threshold) {
        circuit.openedAt = Date.now();
      }
      lastError = new Error(`Request failed with status ${res.status}`);

      if (attempt === retries) {
        return res;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', onCallerAbort);

      // AbortError — don't retry (user cancellation or timeout)
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Caller-initiated abort
        if (callerSignal?.aborted) {
          throw err;
        }
        // Our own timeout abort
        if (controller.signal.aborted) {
          circuit.failures++;
          circuit.probing = false;
          if (circuit.failures >= threshold) {
            circuit.openedAt = Date.now();
          }
          lastError = new Error('Request timed out');
          if (attempt === retries) throw lastError;
          continue;
        }
        // External AbortError — don't retry
        throw err;
      }

      // Network errors — retry
      circuit.failures++;
      circuit.probing = false;
      if (circuit.failures >= threshold) {
        circuit.openedAt = Date.now();
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === retries) throw lastError;
    }
  }

  throw lastError ?? new Error('resilientFetch failed');
}
