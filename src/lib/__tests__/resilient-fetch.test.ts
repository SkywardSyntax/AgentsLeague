import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resilientFetch, resetCircuitBreakers } from '@/lib/network/resilient-fetch';

describe('resilientFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetCircuitBreakers();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('passes through successful fetch unchanged', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await resilientFetch('/api/test', { retries: 0 });
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('times out after configured duration', async () => {
    vi.useRealTimers();

    globalThis.fetch = vi.fn().mockImplementation(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    await expect(
      resilientFetch('/api/test', { timeoutMs: 50, retries: 0 }),
    ).rejects.toThrow(/timed? ?out/i);

    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('retries on 500 with exponential backoff', async () => {
    const callTimes: number[] = [];
    let callCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve(new Response('error', { status: 500 }));
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });

    const promise = resilientFetch('/api/test', { retries: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    // Second gap should be >= first gap (exponential backoff)
    const gap1 = callTimes[1] - callTimes[0];
    const gap2 = callTimes[2] - callTimes[1];
    expect(gap2).toBeGreaterThanOrEqual(gap1);
  });

  it('does not retry on 400 (client error)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));

    const result = await resilientFetch('/api/test', { retries: 2 });
    expect(result.status).toBe(400);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network error (fetch throws)', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });

    const promise = resilientFetch('/api/test', { retries: 1 });
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('circuit breaker opens after N consecutive failures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));

    // Make 5 requests (threshold) with retries=0 so each counts as 1 failure
    for (let i = 0; i < 5; i++) {
      await resilientFetch('/api/cb-test', { retries: 0 });
    }

    // 6th call should reject without calling fetch
    const fetchCountBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await expect(resilientFetch('/api/cb-test', { retries: 0 })).rejects.toThrow(/circuit/i);
    const fetchCountAfter = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(fetchCountAfter).toBe(fetchCountBefore);
  });

  it('circuit breaker resets after cooldown', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));

    // Open the circuit
    for (let i = 0; i < 5; i++) {
      await resilientFetch('/api/cb-reset', { retries: 0 });
    }

    // Advance past cooldown
    await vi.advanceTimersByTimeAsync(31_000);

    // Now mock success
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    const result = await resilientFetch('/api/cb-reset', { retries: 0 });
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('circuit breaker resets failure count on success', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 4) return Promise.resolve(new Response('err', { status: 500 }));
      if (callCount === 5) return Promise.resolve(new Response('ok', { status: 200 }));
      return Promise.resolve(new Response('err', { status: 500 }));
    });

    // 4 failures
    for (let i = 0; i < 4; i++) {
      await resilientFetch('/api/cb-count', { retries: 0 });
    }

    // 1 success — resets count
    await resilientFetch('/api/cb-count', { retries: 0 });

    // 1 more failure — total is 1, not 5, so circuit should not be open
    await resilientFetch('/api/cb-count', { retries: 0 });

    // Should NOT throw — circuit should still be closed
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const result = await resilientFetch('/api/cb-count', { retries: 0 });
    expect(result.status).toBe(200);
  });

  it('respects caller AbortSignal', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    const controller = new AbortController();
    controller.abort();

    await expect(
      resilientFetch('/api/test', { signal: controller.signal, retries: 0 }),
    ).rejects.toThrow(/abort/i);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not retry on AbortError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    await expect(
      resilientFetch('/api/test', { retries: 2 }),
    ).rejects.toThrow(/abort/i);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
