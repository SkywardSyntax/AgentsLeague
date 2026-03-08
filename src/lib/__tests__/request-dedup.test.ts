import { describe, it, expect, vi } from 'vitest';
import { createRequestDedup, buildRequestKey } from '@/lib/agent/request-dedup';

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function mockResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('request dedup', () => {
  it('single request works normally', async () => {
    const dedup = createRequestDedup();
    const res = await dedup.fetch('k1', () => Promise.resolve(mockResponse('ok')));
    expect(await res.text()).toBe('ok');
  });

  it('duplicate in-flight request returns same promise', async () => {
    const dedup = createRequestDedup();
    const fetchFn = vi.fn(() => delay(30).then(() => mockResponse('ok')));
    const p1 = dedup.fetch('k1', fetchFn);
    const p2 = dedup.fetch('k1', fetchFn);
    // Dedup shares the underlying fetch — only one call is made
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(await r1.text()).toBe('ok');
    expect(await r2.text()).toBe('ok');
  });

  it('after resolution, new request starts fresh', async () => {
    const dedup = createRequestDedup();
    const fetchFn = vi.fn(() => Promise.resolve(mockResponse('ok')));
    await dedup.fetch('k1', fetchFn);
    await dedup.fetch('k1', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('failed request clears dedup entry', async () => {
    const dedup = createRequestDedup();
    let calls = 0;
    const fetchFn = vi.fn(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('net'));
      return Promise.resolve(mockResponse('ok'));
    });
    await expect(dedup.fetch('k1', fetchFn)).rejects.toThrow('net');
    expect(dedup.pendingCount()).toBe(0);
    const res = await dedup.fetch('k1', fetchFn);
    expect(res.status).toBe(200);
  });

  it('different URLs are independent', () => {
    const k1 = buildRequestKey('GET', '/api/a');
    const k2 = buildRequestKey('GET', '/api/b');
    expect(k1).not.toBe(k2);
  });

  it('different methods are independent', () => {
    const k1 = buildRequestKey('GET', '/api/a');
    const k2 = buildRequestKey('POST', '/api/a');
    expect(k1).not.toBe(k2);
  });

  it('same URL + different body are independent', () => {
    const k1 = buildRequestKey('POST', '/api/a', '{"x":1}');
    const k2 = buildRequestKey('POST', '/api/a', '{"x":2}');
    expect(k1).not.toBe(k2);
  });

  it('triple concurrent same request — one fetch call', async () => {
    const dedup = createRequestDedup();
    const fetchFn = vi.fn(() => delay(20).then(() => mockResponse('shared')));
    const p1 = dedup.fetch('k1', fetchFn);
    const p2 = dedup.fetch('k1', fetchFn);
    const p3 = dedup.fetch('k1', fetchFn);
    await Promise.all([p1, p2, p3]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('error propagates to all waiters', async () => {
    const dedup = createRequestDedup();
    const fetchFn = vi.fn(() => delay(10).then(() => { throw new Error('fail'); }));
    const p1 = dedup.fetch('k1', fetchFn);
    const p2 = dedup.fetch('k1', fetchFn);
    await expect(p1).rejects.toThrow('fail');
    await expect(p2).rejects.toThrow('fail');
  });

  it('TTL expiry forces fresh request', async () => {
    const dedup = createRequestDedup();
    const fetchFn = vi.fn(() => delay(5).then(() => mockResponse('ok')));

    // First request with very short TTL
    const p1 = dedup.fetch('k1', fetchFn, 1); // 1ms TTL

    // Wait for TTL to expire
    await delay(10);

    // This should start a new request because TTL expired
    const p2 = dedup.fetch('k1', fetchFn);
    await Promise.all([p1, p2]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
