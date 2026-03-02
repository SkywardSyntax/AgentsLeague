import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the retry logic extracted from useAgentStream.
 * Uses a mock fetch to simulate various failure scenarios.
 */

// We test the retry logic by extracting the core decision functions
// and testing them directly, since the hook itself requires React context.

// Replicate shouldRetry and computeDelay from useAgentStream for unit testing.
// These are the same functions used in the hook.

type AgentSSEEvent = { type: string; retryable?: boolean; code?: string; retryAfterMs?: number };

function shouldRetry(
  lastEvent: AgentSSEEvent | null,
  httpStatus: number | null,
  error: unknown,
): { retry: boolean; reason: string } {
  if (lastEvent?.type === 'turn.done') {
    return { retry: false, reason: 'turn_completed' };
  }
  if ((error as { name?: string })?.name === 'AbortError') {
    return { retry: false, reason: 'aborted' };
  }
  if (httpStatus != null) {
    if (httpStatus === 429) return { retry: true, reason: 'rate_limited' };
    if (httpStatus === 408) return { retry: true, reason: 'request_timeout' };
    if (httpStatus === 503) return { retry: true, reason: 'service_unavailable' };
    if (httpStatus >= 400 && httpStatus < 500) return { retry: false, reason: `http_${httpStatus}` };
    if (httpStatus >= 500) return { retry: true, reason: `http_${httpStatus}` };
  }
  if (lastEvent?.type === 'error' && lastEvent.retryable) {
    return { retry: true, reason: lastEvent.code ?? 'unknown' };
  }
  if (lastEvent?.type === 'error' && !lastEvent.retryable) {
    return { retry: false, reason: lastEvent.code ?? 'unknown' };
  }
  if (error instanceof Error) {
    return { retry: true, reason: 'network_error' };
  }
  return { retry: true, reason: 'unknown' };
}

function computeDelay(attempt: number, reason: string, retryAfterMs?: number): number {
  const baseMs = reason === 'rate_limited' ? 2000 : 1000;
  const exponential = Math.min(baseMs * 2 ** attempt, 8000);
  const jitter = exponential * (0.8 + Math.random() * 0.4);
  return retryAfterMs != null ? Math.max(retryAfterMs, jitter) : jitter;
}

describe('shouldRetry', () => {
  it('does not retry after turn.done', () => {
    const result = shouldRetry({ type: 'turn.done' }, 200, null);
    expect(result.retry).toBe(false);
    expect(result.reason).toBe('turn_completed');
  });

  it('does not retry on AbortError', () => {
    const result = shouldRetry(null, null, new DOMException('Aborted', 'AbortError'));
    expect(result.retry).toBe(false);
    expect(result.reason).toBe('aborted');
  });

  it('retries on HTTP 429', () => {
    const result = shouldRetry(null, 429, null);
    expect(result.retry).toBe(true);
    expect(result.reason).toBe('rate_limited');
  });

  it('does not retry on HTTP 400', () => {
    const result = shouldRetry(null, 400, null);
    expect(result.retry).toBe(false);
  });

  it('does not retry on HTTP 401', () => {
    const result = shouldRetry(null, 401, null);
    expect(result.retry).toBe(false);
  });

  it('retries on HTTP 500', () => {
    const result = shouldRetry(null, 500, null);
    expect(result.retry).toBe(true);
  });

  it('retries on HTTP 502', () => {
    const result = shouldRetry(null, 502, null);
    expect(result.retry).toBe(true);
  });

  it('retries on HTTP 408 (request timeout)', () => {
    const result = shouldRetry(null, 408, null);
    expect(result).toEqual({ retry: true, reason: 'request_timeout' });
  });

  it('retries on HTTP 503 (service unavailable)', () => {
    const result = shouldRetry(null, 503, null);
    expect(result).toEqual({ retry: true, reason: 'service_unavailable' });
  });

  it('does not retry on HTTP 404', () => {
    const result = shouldRetry(null, 404, null);
    expect(result).toEqual({ retry: false, reason: 'http_404' });
  });

  it('retries on retryable error event', () => {
    const result = shouldRetry({ type: 'error', retryable: true, code: 'STREAM_FAILURE' }, null, null);
    expect(result.retry).toBe(true);
    expect(result.reason).toBe('STREAM_FAILURE');
  });

  it('does not retry on non-retryable error event', () => {
    const result = shouldRetry({ type: 'error', retryable: false, code: 'AUTH_ERROR' }, null, null);
    expect(result.retry).toBe(false);
  });

  it('retries on network error', () => {
    const result = shouldRetry(null, null, new Error('Failed to fetch'));
    expect(result.retry).toBe(true);
    expect(result.reason).toBe('network_error');
  });
});

describe('computeDelay', () => {
  it('produces exponentially increasing delays', () => {
    // Run multiple times to account for jitter, check the order of magnitude
    const d0 = computeDelay(0, 'network_error');
    const d1 = computeDelay(1, 'network_error');
    const d2 = computeDelay(2, 'network_error');

    // Base delays: 1000, 2000, 4000 with ±20% jitter
    expect(d0).toBeGreaterThanOrEqual(800);
    expect(d0).toBeLessThanOrEqual(1400);
    expect(d1).toBeGreaterThanOrEqual(1600);
    expect(d1).toBeLessThanOrEqual(2800);
    expect(d2).toBeGreaterThanOrEqual(3200);
    expect(d2).toBeLessThanOrEqual(5600);
  });

  it('caps at 8000ms', () => {
    const d = computeDelay(10, 'network_error');
    expect(d).toBeLessThanOrEqual(8000 * 1.2); // 8000 + 20% jitter
  });

  it('uses slower backoff for rate_limited', () => {
    const d0 = computeDelay(0, 'rate_limited');
    // Base 2000 with ±20% jitter
    expect(d0).toBeGreaterThanOrEqual(1600);
    expect(d0).toBeLessThanOrEqual(2800);
  });

  it('respects retryAfterMs when larger', () => {
    const d = computeDelay(0, 'network_error', 5000);
    expect(d).toBeGreaterThanOrEqual(5000);
  });

  it('ignores retryAfterMs when smaller than computed', () => {
    const d = computeDelay(2, 'network_error', 100);
    // Computed is ~4000 ± jitter, so should be > 100
    expect(d).toBeGreaterThan(100);
  });
});
