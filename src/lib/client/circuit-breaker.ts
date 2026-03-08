export class CircuitOpenError extends Error {
  override readonly name = 'CircuitOpenError' as const;

  constructor(message?: string) {
    super(message ?? 'Circuit breaker is open');
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts?: number;
}

export interface CircuitBreakerStats {
  successes: number;
  failures: number;
  rejections: number;
  state: CircuitState;
  lastFailureTime: number | null;
}

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  state(): CircuitState;
  stats(): CircuitBreakerStats;
  reset(): void;
}

export function createCircuitBreaker(opts: CircuitBreakerOptions): CircuitBreaker {
  let currentState: CircuitState = 'closed';
  let consecutiveFailures = 0;
  let successes = 0;
  let failures = 0;
  let rejections = 0;
  let lastFailureTime: number | null = null;
  let openedAt: number | null = null;
  let probing = false;

  function checkTransition(): void {
    if (currentState === 'open' && openedAt !== null) {
      if (Date.now() - openedAt >= opts.resetTimeoutMs) {
        currentState = 'half-open';
      }
    }
  }

  return {
    execute<T>(fn: () => Promise<T>): Promise<T> {
      checkTransition();

      if (currentState === 'open') {
        rejections++;
        return Promise.reject(new CircuitOpenError());
      }

      // Half-open: only one concurrent probe request allowed
      if (currentState === 'half-open') {
        if (probing) {
          rejections++;
          return Promise.reject(new CircuitOpenError());
        }
        probing = true;
      }

      return fn().then(
        (result) => {
          successes++;
          consecutiveFailures = 0;
          if (currentState === 'half-open') {
            // Probe succeeded → HALF_OPEN → CLOSED
            currentState = 'closed';
            probing = false;
          }
          return result;
        },
        (error) => {
          failures++;
          consecutiveFailures++;
          lastFailureTime = Date.now();

          if (currentState === 'half-open') {
            // Probe failed → HALF_OPEN → OPEN
            currentState = 'open';
            openedAt = Date.now();
            probing = false;
          } else if (consecutiveFailures >= opts.failureThreshold) {
            currentState = 'open';
            openedAt = Date.now();
          }

          throw error;
        },
      );
    },

    state(): CircuitState {
      checkTransition();
      return currentState;
    },

    stats(): CircuitBreakerStats {
      checkTransition();
      return {
        successes,
        failures,
        rejections,
        state: currentState,
        lastFailureTime,
      };
    },

    reset(): void {
      currentState = 'closed';
      consecutiveFailures = 0;
      successes = 0;
      failures = 0;
      rejections = 0;
      lastFailureTime = null;
      openedAt = null;
      probing = false;
    },
  };
}
