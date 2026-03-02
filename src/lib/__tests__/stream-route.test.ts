import { describe, it, expect, beforeEach, afterEach } from 'vitest';

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
