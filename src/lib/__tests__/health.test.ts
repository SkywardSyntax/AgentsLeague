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

  it('returns Content-Type application/json', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.resetModules();
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();

    expect(res.headers.get('content-type')).toContain('application/json');
    vi.unstubAllEnvs();
  });

  it('returns ok=false with status 200 when env is invalid', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.resetModules();
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();

    // Liveness probe always returns 200 but signals health via ok field
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.checks.env_valid).toBe(false);
    vi.unstubAllEnvs();
  });

  it('uptime_ms is monotonically non-decreasing across calls', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.resetModules();
    const { GET } = await import('@/app/api/health/route');

    const res1 = await GET();
    const body1 = await res1.json();
    // Small delay to ensure time advances
    await new Promise((resolve) => setTimeout(resolve, 5));
    const res2 = await GET();
    const body2 = await res2.json();

    expect(body2.uptime_ms).toBeGreaterThanOrEqual(body1.uptime_ms);
    vi.unstubAllEnvs();
  });

  it('node_version starts with "v"', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.resetModules();
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();

    expect(body.node_version).toMatch(/^v\d+/);
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

  it('returns Content-Type application/json', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.resetModules();
    const { GET } = await import('@/app/api/health/ready/route');
    const res = await GET();

    expect(res.headers.get('content-type')).toContain('application/json');
    vi.unstubAllEnvs();
  });
});
