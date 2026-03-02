import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRenderTexToSvgServer = vi.fn();

vi.mock('@/lib/server/mathjax', () => ({
  renderTexToSvgServer: (...args: unknown[]) => mockRenderTexToSvgServer(...args),
}));

import { POST } from '@/app/api/latex/svg/route';

function makeRequest(body: string, contentType = 'application/json'): Request {
  return new Request('http://localhost/api/latex/svg', {
    method: 'POST',
    body,
    headers: { 'Content-Type': contentType },
  });
}

describe('/api/latex/svg POST — negative paths', () => {
  beforeEach(() => {
    mockRenderTexToSvgServer.mockReset();
  });

  it('non-JSON body returns 400 with BAD_REQUEST', async () => {
    const req = makeRequest('not json', 'text/plain');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('BAD_REQUEST');
  });

  it('missing tex field returns 400 with VALIDATION_ERROR', async () => {
    const req = makeRequest(JSON.stringify({ displayMode: true }));
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.issues).toBeDefined();
  });

  it('empty tex string returns 400 with VALIDATION_ERROR', async () => {
    const req = makeRequest(JSON.stringify({ tex: '' }));
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('render failure returns 422 with RENDER_FAILED', async () => {
    mockRenderTexToSvgServer.mockRejectedValue(new Error('MathJax exploded'));
    const req = makeRequest(JSON.stringify({ tex: '\\frac{1}{2}' }));
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('RENDER_FAILED');
    expect(body.message).toBe('MathJax exploded');
  });

  it('valid request returns 200 with SVG string', async () => {
    mockRenderTexToSvgServer.mockResolvedValue('<svg>mock</svg>');
    const req = makeRequest(JSON.stringify({ tex: '\\frac{1}{2}' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.svg).toBe('string');
    expect(body.svg).toContain('<svg');
  });
});
