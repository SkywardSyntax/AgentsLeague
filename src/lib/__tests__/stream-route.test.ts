import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { classifyStreamError } from '@/app/api/agent/stream/route';

/**
 * Integration-style tests for the streaming route handler.
 * Uses AGENT_STREAM_MODE=mock to avoid OpenAI API calls.
 */

// Dynamically import to allow env var setup before module load
async function importRoute() {
  // Reset module cache so activeStreams starts fresh
  const mod = await import('@/app/api/agent/stream/route');
  return mod;
}

function makeRequest(body: Record<string, unknown>, signal?: AbortSignal): Request {
  return new Request('http://localhost/api/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

const validBody = {
  sessionId: 'test-session-1',
  userMessage: 'Hello world',
  history: [],
};

describe('POST /api/agent/stream (mock mode)', () => {
  beforeEach(() => {
    process.env.AGENT_STREAM_MODE = 'mock';
  });

  afterEach(() => {
    delete process.env.AGENT_STREAM_MODE;
  });

  it('returns SSE stream with correct content-type', async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('stream ends with turn.done event', async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest(validBody));
    const text = await res.text();
    const events = text
      .split('\n\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5).trim()));

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe('turn.done');
  });

  it('rejects invalid JSON with 400', async () => {
    const { POST } = await importRoute();
    const req = new Request('http://localhost/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects invalid schema with 400', async () => {
    // Disable mock mode so schema validation runs
    delete process.env.AGENT_STREAM_MODE;
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ sessionId: '', userMessage: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });
});

describe('classifyStreamError', () => {
  it('classifies client disconnect (AbortError + requestAborted)', () => {
    const err = new DOMException('Aborted', 'AbortError');
    const result = classifyStreamError(err, true);
    expect(result.code).toBe('CLIENT_DISCONNECTED');
    expect(result.retryable).toBe(false);
  });

  it('classifies turn timeout (AbortError, not requestAborted)', () => {
    const err = new DOMException('Timeout', 'AbortError');
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('TURN_TIMEOUT');
    expect(result.retryable).toBe(true);
  });

  it('classifies 429 rate limit with retry-after', () => {
    const err = { status: 429, headers: { 'retry-after': '5' }, message: 'rate limited' };
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('RATE_LIMIT');
    expect(result.retryable).toBe(true);
    expect(result.retryAfterMs).toBe(5000);
  });

  it('classifies 401 auth error', () => {
    const err = { status: 401, message: 'unauthorized' };
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('AUTH_ERROR');
    expect(result.retryable).toBe(false);
  });

  it('classifies 403 auth error', () => {
    const err = { status: 403, message: 'forbidden' };
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('AUTH_ERROR');
    expect(result.retryable).toBe(false);
  });

  it('classifies connection error', () => {
    const err = new Error('Connection error: ECONNREFUSED');
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('API_CONNECTION_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('classifies unknown error as STREAM_FAILURE', () => {
    const err = new Error('something broke');
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('STREAM_FAILURE');
    expect(result.retryable).toBe(true);
  });

  it('classifies non-Error values as STREAM_FAILURE', () => {
    const result = classifyStreamError('string error', false);
    expect(result.code).toBe('STREAM_FAILURE');
    expect(result.retryable).toBe(true);
  });

  it('classifies ECONNRESET as API_CONNECTION_ERROR', () => {
    const err = new Error('read ECONNRESET');
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('API_CONNECTION_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('classifies ETIMEDOUT as API_CONNECTION_ERROR', () => {
    const err = new Error('connect ETIMEDOUT 1.2.3.4:443');
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('API_CONNECTION_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('classifies socket hang up as API_CONNECTION_ERROR', () => {
    const err = new Error('socket hang up');
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('API_CONNECTION_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('classifies error with code property ECONNRESET as API_CONNECTION_ERROR', () => {
    const err = new Error('some generic message');
    (err as NodeJS.ErrnoException).code = 'ECONNRESET';
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('API_CONNECTION_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('classifies error with code property ENOTFOUND as API_CONNECTION_ERROR', () => {
    const err = new Error('getaddrinfo failed');
    (err as NodeJS.ErrnoException).code = 'ENOTFOUND';
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('API_CONNECTION_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('returns undefined retryAfterMs for HTTP-date Retry-After header', () => {
    const err = { status: 429, headers: { 'retry-after': 'Thu, 01 Dec 2025 16:00:00 GMT' }, message: 'rate limited' };
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('RATE_LIMIT');
    expect(result.retryAfterMs).toBeUndefined();
  });

  it('returns valid retryAfterMs for numeric Retry-After header', () => {
    const err = { status: 429, headers: { 'retry-after': '10' }, message: 'rate limited' };
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('RATE_LIMIT');
    expect(result.retryAfterMs).toBe(10000);
  });

  it('classifies 502 gateway error as retryable STREAM_FAILURE', () => {
    const err = { status: 502, message: 'Bad Gateway' };
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('STREAM_FAILURE');
    expect(result.retryable).toBe(true);
  });

  it('classifies 503 service unavailable as retryable STREAM_FAILURE', () => {
    const err = { status: 503, message: 'Service Unavailable' };
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('STREAM_FAILURE');
    expect(result.retryable).toBe(true);
  });

  it('classifies error with code ECONNRESET and status 500 via code property', () => {
    const err = new Error('upstream failure');
    (err as NodeJS.ErrnoException).code = 'ECONNRESET';
    Object.assign(err, { status: 500 });
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('API_CONNECTION_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('classifies error with code EAI_AGAIN as API_CONNECTION_ERROR', () => {
    const err = new Error('getaddrinfo EAI_AGAIN');
    (err as NodeJS.ErrnoException).code = 'EAI_AGAIN';
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('API_CONNECTION_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('classifies error with unrecognized code as STREAM_FAILURE', () => {
    const err = new Error('pipe broken');
    (err as NodeJS.ErrnoException).code = 'EPIPE';
    const result = classifyStreamError(err, false);
    expect(result.code).toBe('STREAM_FAILURE');
    expect(result.retryable).toBe(true);
  });
});
