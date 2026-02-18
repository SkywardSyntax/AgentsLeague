'use client';

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

// ── Toast Types ──────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  readonly id: string;
  readonly type: ToastType;
  readonly message: string;
  readonly duration: number;
  readonly action?: RecoveryAction | undefined;
}

export interface RecoveryAction {
  readonly label: string;
  readonly handler: () => void;
}

// ── Error Types ──────────────────────────────────────────────────────

export type ErrorCategory =
  | 'validation'
  | 'timeout'
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'auth'
  | 'unknown';

export interface ClassifiedError {
  readonly category: ErrorCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfter?: number;
}

interface FailedOperation {
  readonly fn: () => Promise<unknown>;
  attempts: number;
  readonly maxAttempts: number;
}

// ── Toast Store (module-level, shared across all hook instances) ─────

let toasts: readonly Toast[] = [];
const listeners = new Set<() => void>();
const timerMap = new Map<string, ReturnType<typeof setTimeout>>();

function notify(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly Toast[] {
  return toasts;
}

// Cache server snapshot to prevent infinite loop with useSyncExternalStore
const cachedServerSnapshot: readonly Toast[] = [] as const;

function getServerSnapshot(): readonly Toast[] {
  return cachedServerSnapshot;
}

function addToast(toast: Toast): void {
  toasts = [...toasts, toast];
  notify();

  if (toast.duration > 0) {
    const timer = setTimeout(() => {
      dismissToast(toast.id);
    }, toast.duration);
    timerMap.set(toast.id, timer);
  }
}

export function dismissToast(id: string): void {
  const timer = timerMap.get(id);
  if (timer != null) {
    clearTimeout(timer);
    timerMap.delete(id);
  }
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

// ── Error Classification ─────────────────────────────────────────────

const API_ERROR_MAP: Record<string, ClassifiedError> = {
  VALIDATION_ERROR: {
    category: 'validation',
    message: 'Invalid request — please check your input',
    retryable: false,
  },
  BAD_REQUEST: {
    category: 'validation',
    message: 'Malformed request',
    retryable: false,
  },
  OPENAI_AUTH_ERROR: {
    category: 'auth',
    message: 'AI service authentication failed',
    retryable: false,
  },
  OPENAI_RATE_LIMIT: {
    category: 'rate_limit',
    message: 'Rate limit reached — please wait a moment',
    retryable: true,
    retryAfter: 10,
  },
  OPENAI_TIMEOUT: {
    category: 'timeout',
    message: 'Request timed out — please try again',
    retryable: true,
  },
  OPENAI_OVERLOADED: {
    category: 'server',
    message: 'AI service is temporarily overloaded',
    retryable: true,
    retryAfter: 30,
  },
  INTERNAL_ERROR: {
    category: 'server',
    message: 'An unexpected server error occurred',
    retryable: true,
  },
};

export function classifyError(error: unknown): ClassifiedError {
  // API error response with known error code
  if (error != null && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.code === 'string' && err.code in API_ERROR_MAP) {
      return API_ERROR_MAP[err.code]!;
    }
    // Also check 'error' field (matches server response format)
    if (typeof err.error === 'string' && err.error in API_ERROR_MAP) {
      const classified = API_ERROR_MAP[err.error]!;
      return typeof err.message === 'string'
        ? { ...classified, message: err.message }
        : classified;
    }
    // HTTP status-based classification
    if (typeof err.status === 'number') {
      const status = err.status;
      if (status === 400)
        return { category: 'validation', message: typeof err.message === 'string' ? err.message : 'Bad request', retryable: false };
      if (status === 401 || status === 403)
        return { category: 'auth', message: 'Authentication error', retryable: false };
      if (status === 429)
        return { category: 'rate_limit', message: 'Too many requests — please slow down', retryable: true, retryAfter: 10 };
      if (status === 408 || status === 504)
        return { category: 'timeout', message: 'Request timed out', retryable: true };
      if (status >= 500)
        return { category: 'server', message: 'Server error — please try again', retryable: true };
    }
  }

  // Network / fetch errors
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return { category: 'network', message: 'Network error — check your connection', retryable: true };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { category: 'timeout', message: 'Request was cancelled', retryable: true };
  }
  if (error instanceof Error) {
    if (/Failed to fetch|NetworkError|Load failed/i.test(error.message)) {
      return { category: 'network', message: 'Network error — check your connection', retryable: true };
    }
  }

  return {
    category: 'unknown',
    message: error instanceof Error ? error.message : 'An unexpected error occurred',
    retryable: false,
  };
}

// ── Retry Utilities ──────────────────────────────────────────────────

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function getBackoffDelay(attempt: number, retryAfter?: number): number {
  if (retryAfter != null) return retryAfter * 1_000;
  const exponential = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  // Add jitter: 50-100% of exponential delay
  const jitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.round(jitter);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Debug Logging ────────────────────────────────────────────────────

function logError(classified: ClassifiedError, raw: unknown): void {
  const timestamp = new Date().toISOString();
  console.error(
    `[ErrorHandling ${timestamp}] [${classified.category}] ${classified.message}`,
    { classified, raw },
  );
}

// ── Toast Duration Defaults ──────────────────────────────────────────

const TOAST_DURATIONS: Record<ToastType, number> = {
  success: 3_000,
  info: 4_000,
  warning: 5_000,
  error: 6_000,
};

// ── Hook ─────────────────────────────────────────────────────────────

export function useErrorHandling() {
  const currentToasts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const lastFailedRef = useRef<FailedOperation | null>(null);
  const [error, setError] = useState<ClassifiedError | null>(null);

  const createToast = useCallback(
    (type: ToastType, message: string, action?: RecoveryAction  ): string => {
      const id = crypto.randomUUID();
      const toast: Toast = { id, type, message, duration: TOAST_DURATIONS[type], action };
      addToast(toast);
      return id;
    },
    [],
  );

  const showError = useCallback(
    (message: string, action?: RecoveryAction): string =>
      createToast('error', message, action),
    [createToast],
  );

  const showSuccess = useCallback(
    (message: string): string => createToast('success', message),
    [createToast],
  );

  const showInfo = useCallback(
    (message: string): string => createToast('info', message),
    [createToast],
  );

  const showWarning = useCallback(
    (message: string, action?: RecoveryAction): string =>
      createToast('warning', message, action),
    [createToast],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Classify a raw error, log it, show a toast, and update error state.
   * Returns the classified error for callers that need it.
   */
  const handleError = useCallback(
    (rawError: unknown, recoveryAction?: RecoveryAction): ClassifiedError => {
      const classified = classifyError(rawError);
      logError(classified, rawError);
      setError(classified);

      const action =
        recoveryAction ??
        (classified.retryable
          ? { label: 'Retry', handler: () => lastFailedRef.current && void retryLastFailedInner() }
          : undefined);

      showError(classified.message, action);
      return classified;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retryLastFailedInner defined below
    [showError],
  );

  /**
   * Wrap an async operation with automatic retry and exponential backoff.
   * On final failure the error is surfaced via `handleError`.
   */
  const withRetry = useCallback(
    async <T>(
      fn: () => Promise<T>,
      maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    ): Promise<T> => {
      lastFailedRef.current = { fn, attempts: 0, maxAttempts };

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const op = lastFailedRef.current;
          if (op) op.attempts = attempt + 1;
          const result = await fn();
          // Success — clear error state
          lastFailedRef.current = null;
          setError(null);
          return result;
        } catch (err) {
          const classified = classifyError(err);

          if (!classified.retryable || attempt === maxAttempts - 1) {
            handleError(err);
            throw err;
          }

          const backoff = getBackoffDelay(attempt, classified.retryAfter);
          logError(
            { ...classified, message: `Attempt ${attempt + 1}/${maxAttempts} failed, retrying in ${backoff}ms` },
            err,
          );
          showWarning(`Retrying… (attempt ${attempt + 2}/${maxAttempts})`);
          await delay(backoff);
        }
      }

      // Unreachable, but satisfies TypeScript
      throw new Error('Retry loop exited unexpectedly');
    },
    [handleError, showWarning],
  );

  /** Retry the most recent failed operation (used by recovery actions). */
  async function retryLastFailedInner(): Promise<void> {
    const failed = lastFailedRef.current;
    if (!failed) return;

    try {
      await withRetry(failed.fn, failed.maxAttempts);
      showSuccess('Operation succeeded on retry');
    } catch {
      // handleError already called inside withRetry
    }
  }

  const retryLastFailed = useCallback(async (): Promise<void> => {
    await retryLastFailedInner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withRetry, showSuccess]);

  return {
    // Toast actions
    showError,
    showSuccess,
    showInfo,
    showWarning,
    dismissToast,
    toasts: currentToasts,

    // Error state
    error,
    clearError,
    handleError,

    // Retry
    withRetry,
    retryLastFailed,
  } as const;
}
