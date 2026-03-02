import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '@/lib/client/retry';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockFetchSequence(responses: Array<{ status: number; headers?: Record<string, string> } | Error>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const item = responses[callIndex++];
    if (!item) throw new Error('Unexpected fetch call');
    if (item instanceof Error) throw item;
    return new Response(JSON.stringify({ ok: item.status < 400 }), {
      status: item.status,
      headers: { 'Content-Type': 'application/json', ...(item.headers ?? {}) },
    });
  }) as unknown as typeof globalThis.fetch;
}

describe('fetchWithRetry', () => {
  it('succeeds on first attempt without retry', async () => {
    const mockFetch = mockFetchSequence([{ status: 200 }]);
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('/test', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 503, succeeds on third attempt', async () => {
    const mockFetch = mockFetchSequence([
      { status: 503 },
      { status: 503 },
      { status: 200 },
    ]);
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('/test', { method: 'GET' }, { maxRetries: 2, baseDelayMs: 10 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable status (400)', async () => {
    const mockFetch = mockFetchSequence([{ status: 400 }]);
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('/test', { method: 'GET' }, { maxRetries: 2, baseDelayMs: 10 });
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('aborts during backoff delay — no further fetch calls', async () => {
    const controller = new AbortController();
    const mockFetch = mockFetchSequence([{ status: 503 }, { status: 200 }]);
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry(
      '/test',
      { method: 'GET', signal: controller.signal },
      { maxRetries: 2, baseDelayMs: 5000 },
    );

    // Abort after the first failure but during the backoff delay
    setTimeout(() => controller.abort(), 100);

    await expect(promise).rejects.toThrow('aborted');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('respects Retry-After header on 429', async () => {
    const mockFetch = mockFetchSequence([
      { status: 429, headers: { 'Retry-After': '2' } },
      { status: 200 },
    ]);
    vi.stubGlobal('fetch', mockFetch);

    const startTime = Date.now();
    const res = await fetchWithRetry('/test', { method: 'GET' }, { maxRetries: 1, baseDelayMs: 10 });
    const elapsed = Date.now() - startTime;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Retry-After: 2 means 2000ms delay (with fake timers, this should advance)
    expect(elapsed).toBeGreaterThanOrEqual(1900);
  });

  it('calls onRetry callback on each retry attempt', async () => {
    const mockFetch = mockFetchSequence([{ status: 503 }, { status: 503 }, { status: 200 }]);
    vi.stubGlobal('fetch', mockFetch);
    const onRetry = vi.fn();

    await fetchWithRetry('/test', { method: 'GET' }, { maxRetries: 2, baseDelayMs: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, 2);
    expect(onRetry).toHaveBeenCalledWith(2, 2);
  });

  it('retries on network error (fetch throws)', async () => {
    const mockFetch = mockFetchSequence([
      new TypeError('Failed to fetch'),
      { status: 200 },
    ]);
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('/test', { method: 'GET' }, { maxRetries: 1, baseDelayMs: 10 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on network error', async () => {
    const mockFetch = mockFetchSequence([
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
    ]);
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithRetry('/test', { method: 'GET' }, { maxRetries: 2, baseDelayMs: 10 }),
    ).rejects.toThrow('Failed to fetch');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('returns last failed response when retries exhausted on retryable status', async () => {
    const mockFetch = mockFetchSequence([{ status: 503 }, { status: 502 }]);
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('/test', { method: 'GET' }, { maxRetries: 1, baseDelayMs: 10 });
    expect(res.status).toBe(502);
  });

  it('does not retry when abort signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const mockFetch = mockFetchSequence([]);
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithRetry('/test', { method: 'GET', signal: controller.signal }, { maxRetries: 2 }),
    ).rejects.toThrow();
  });
});
