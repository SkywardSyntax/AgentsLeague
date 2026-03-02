import { describe, it, expect, vi } from 'vitest';

describe('GET /api/health', () => {
  it('returns health response with expected shape', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    // Re-import to get fresh module with env set
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks).toBeDefined();
    expect(body.checks.env_valid).toBe(true);
    expect(body.uptime_ms).toBeGreaterThanOrEqual(0);
    expect(body.node_version).toBeTruthy();
    expect(body.ts).toBeGreaterThan(0);
    vi.unstubAllEnvs();
  });

  it('reports env_valid=false when OPENAI_API_KEY missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    // Clear module cache for fresh import
    vi.resetModules();
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();

    expect(body.checks.env_valid).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('GET /api/health/ready', () => {
  it('returns 200 when ready', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.resetModules();
    const { GET } = await import('@/app/api/health/ready/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ready).toBe(true);
    vi.unstubAllEnvs();
  });

  it('returns 503 when not ready', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.resetModules();
    const { GET } = await import('@/app/api/health/ready/route');
    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ready).toBe(false);
    vi.unstubAllEnvs();
  });
});
