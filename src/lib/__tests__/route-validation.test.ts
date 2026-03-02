import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/agent/stream/route';

describe('stream route validation error response', () => {
  it('includes requestId in JSON body for validation errors', async () => {
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': 'test-session-validation-1',
      },
      body: JSON.stringify({ invalid: 'body' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe('string');
    expect(body.issues).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('sets X-Request-Id header matching body requestId on validation error', async () => {
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': 'test-session-validation-2',
      },
      body: JSON.stringify({ not: 'valid' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const requestId = res.headers.get('X-Request-Id');
    expect(requestId).toBeDefined();
    expect(typeof requestId).toBe('string');

    const body = await res.json();
    expect(body.requestId).toBe(requestId);
  });
});
