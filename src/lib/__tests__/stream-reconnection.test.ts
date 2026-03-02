import { describe, it, expect } from 'vitest';
import { RetryPolicy, DEFAULT_RETRY_CONFIG } from '@/lib/stream-reconnect';
import type { RetryConfig } from '@/lib/stream-reconnect';

describe('RetryPolicy', () => {
  const defaultPolicy = () => new RetryPolicy({ ...DEFAULT_RETRY_CONFIG });

  it('canRetry returns true for network TypeError', () => {
    const policy = defaultPolicy();
    expect(policy.canRetry(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('canRetry returns false for AbortError', () => {
    const policy = defaultPolicy();
    const abort = new DOMException('signal aborted', 'AbortError');
    expect(policy.canRetry(abort)).toBe(false);
  });

  it('canRetry returns true for 503 Response', () => {
    const policy = defaultPolicy();
    expect(policy.canRetry(new Response(null, { status: 503 }))).toBe(true);
  });

  it('canRetry returns false for 400 Response', () => {
    const policy = defaultPolicy();
    expect(policy.canRetry(new Response(null, { status: 400 }))).toBe(false);
  });

  it('canRetry returns false for 401 Response', () => {
    const policy = defaultPolicy();
    expect(policy.canRetry(new Response(null, { status: 401 }))).toBe(false);
  });

  it('canRetry returns false after maxRetries exhausted', () => {
    const policy = new RetryPolicy({ ...DEFAULT_RETRY_CONFIG, maxRetries: 2 });
    policy.nextDelayMs(); // attempt 0 -> 1
    policy.nextDelayMs(); // attempt 1 -> 2
    expect(policy.canRetry(new TypeError('network'))).toBe(false);
  });

  it('nextDelayMs implements exponential backoff', () => {
    const policy = new RetryPolicy({
      ...DEFAULT_RETRY_CONFIG,
      baseDelayMs: 1000,
      maxDelayMs: 100000,
      maxRetries: 5,
    });
    expect(policy.nextDelayMs()).toBe(1000);
    expect(policy.nextDelayMs()).toBe(2000);
    expect(policy.nextDelayMs()).toBe(4000);
  });

  it('nextDelayMs caps at maxDelayMs', () => {
    const policy = new RetryPolicy({
      ...DEFAULT_RETRY_CONFIG,
      baseDelayMs: 1000,
      maxDelayMs: 3000,
      maxRetries: 5,
    });
    expect(policy.nextDelayMs()).toBe(1000); // 1000 * 2^0
    expect(policy.nextDelayMs()).toBe(2000); // 1000 * 2^1
    expect(policy.nextDelayMs()).toBe(3000); // capped (1000 * 2^2 = 4000 > 3000)
    expect(policy.nextDelayMs()).toBe(3000); // still capped
  });

  it('reset() restores retry budget', () => {
    const policy = new RetryPolicy({ ...DEFAULT_RETRY_CONFIG, maxRetries: 1 });
    policy.nextDelayMs(); // exhaust
    expect(policy.canRetry(new TypeError('network'))).toBe(false);
    policy.reset();
    expect(policy.canRetry(new TypeError('network'))).toBe(true);
    expect(policy.attempts).toBe(0);
  });

  it('DEFAULT_RETRY_CONFIG has sensible values', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(2);
    expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(8000);
    expect(DEFAULT_RETRY_CONFIG.retryableStatuses).toContain(502);
    expect(DEFAULT_RETRY_CONFIG.retryableStatuses).toContain(503);
    expect(DEFAULT_RETRY_CONFIG.retryableStatuses).toContain(504);
    expect(DEFAULT_RETRY_CONFIG.retryableStatuses).not.toContain(500);
    expect(DEFAULT_RETRY_CONFIG.retryableStatuses).not.toContain(429);
  });
});
