import { describe, it, expect } from 'vitest';
import {
  parseJsonWithLimit,
  PayloadTooLargeError,
  BODY_LIMITS,
} from '@/lib/server/body-limit';

function makeRequest(body: string | null, headers?: Record<string, string>): Request {
  const init: RequestInit = { method: 'POST', headers };
  if (body !== null) {
    init.body = body;
  }
  return new Request('http://localhost/test', init);
}

describe('Request Body Size Limits', () => {
  it('small payload parses successfully', async () => {
    const data = { message: 'hello' };
    const req = makeRequest(JSON.stringify(data));
    const result = await parseJsonWithLimit(req, 1024);
    expect(result).toEqual(data);
  });

  it('payload exactly at limit parses successfully', async () => {
    // Create a JSON body of exactly 1024 bytes
    const padding = 'x'.repeat(1024 - '{"k":""}'.length);
    const body = JSON.stringify({ k: padding });
    expect(new TextEncoder().encode(body).byteLength).toBe(1024);
    const req = makeRequest(body);
    const result = await parseJsonWithLimit(req, 1024);
    expect(result).toEqual({ k: padding });
  });

  it('payload 1 byte over limit throws PayloadTooLargeError', async () => {
    const padding = 'x'.repeat(1024 - '{"k":""}'.length + 1);
    const body = JSON.stringify({ k: padding });
    expect(new TextEncoder().encode(body).byteLength).toBe(1025);
    const req = makeRequest(body);
    await expect(parseJsonWithLimit(req, 1024)).rejects.toThrow(PayloadTooLargeError);
  });

  it('Content-Length header enables fast rejection', async () => {
    const req = makeRequest('{}', { 'Content-Length': '2000000' });
    await expect(parseJsonWithLimit(req, 1024)).rejects.toThrow(PayloadTooLargeError);
  });

  it('missing Content-Length falls back to stream counting', async () => {
    const body = JSON.stringify({ data: 'x'.repeat(2048) });
    // Build request without Content-Length by removing it
    const req = new Request('http://localhost/test', {
      method: 'POST',
      body,
    });
    // The Fetch API may auto-set Content-Length, so we verify the function
    // still enforces the limit regardless of path taken
    await expect(parseJsonWithLimit(req, 1024)).rejects.toThrow(PayloadTooLargeError);
  });

  it('PayloadTooLargeError has correct properties', async () => {
    const req = makeRequest('{}', { 'Content-Length': '2048' });
    try {
      await parseJsonWithLimit(req, 1024);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PayloadTooLargeError);
      const e = err as PayloadTooLargeError;
      expect(e.status).toBe(413);
      expect(e.code).toBe('PAYLOAD_TOO_LARGE');
      expect(e.limit).toBe(1024);
      expect(e.message).toContain('1KB');
    }
  });

  it('BODY_LIMITS.AGENT_STREAM is 512KB', () => {
    expect(BODY_LIMITS.AGENT_STREAM).toBe(512 * 1024);
  });

  it('BODY_LIMITS.LATEX_SVG is 16KB', () => {
    expect(BODY_LIMITS.LATEX_SVG).toBe(16 * 1024);
  });

  it('empty body throws no body error', async () => {
    const req = new Request('http://localhost/test', { method: 'POST' });
    await expect(parseJsonWithLimit(req, 1024)).rejects.toThrow(/no body/i);
  });

  it('invalid JSON in valid-size body throws SyntaxError', async () => {
    const req = makeRequest('not json{{');
    await expect(parseJsonWithLimit(req, 1024)).rejects.toThrow(SyntaxError);
  });
});
