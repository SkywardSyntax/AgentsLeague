export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

export class RetryPolicy {
  private attempt = 0;
  constructor(private config: RetryConfig) {}

  canRetry(error: Error | Response): boolean {
    if (this.attempt >= this.config.maxRetries) return false;
    if (error instanceof Response) {
      return this.config.retryableStatuses.includes(error.status);
    }
    // Network errors are retryable; AbortErrors are not
    return error.name !== 'AbortError';
  }

  nextDelayMs(): number {
    const delay = Math.min(
      this.config.baseDelayMs * Math.pow(2, this.attempt),
      this.config.maxDelayMs,
    );
    this.attempt++;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }

  get attempts(): number {
    return this.attempt;
  }
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  retryableStatuses: [502, 503, 504],
};
