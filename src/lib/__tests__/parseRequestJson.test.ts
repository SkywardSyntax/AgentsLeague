import { describe, it, expect } from 'vitest';
import { parseRequestJson } from '@/app/api/agent/stream/route';

describe('parseRequestJson', () => {
  it('returns a 400 Response when the request body is not valid JSON', async () => {
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });

    const result = await parseRequestJson(req, 'req-abc');

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(400);
    expect(res.headers.get('X-Request-Id')).toBe('req-abc');

    const body = await res.json();
    expect(body).toEqual({
      error: 'BAD_REQUEST',
      message: 'Request body must be JSON',
    });
  });

  it('returns { json } when the request body is valid JSON', async () => {
    const payload = { userMessage: 'hello', extra: 42 };
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await parseRequestJson(req, 'req-xyz');

    expect(result).not.toBeInstanceOf(Response);
    expect((result as { json: unknown }).json).toEqual(payload);
  });
});
