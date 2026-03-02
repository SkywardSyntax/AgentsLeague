import { describe, it, expect, beforeEach, afterEach } from 'vitest';

async function importRoute() {
  const mod = await import('@/app/api/agent/stream/route');
  return mod;
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'mock-test-session' },
    body: JSON.stringify(body),
  });
}

function parseSSEEvents(text: string) {
  return text
    .split('\n\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5).trim()));
}

describe('Mock scenarios', () => {
  beforeEach(() => {
    process.env.AGENT_STREAM_MODE = 'mock';
  });

  afterEach(() => {
    delete process.env.AGENT_STREAM_MODE;
  });

  it('happy scenario returns complete stream', async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ userMessage: 'test', scenario: 'happy' }));
    expect(res.status).toBe(200);
    const events = parseSSEEvents(await res.text());
    expect(events[events.length - 1].type).toBe('turn.done');
    expect(events[events.length - 1].partial).toBeUndefined();
  });

  it('error_mid_stream emits error + partial turn.done', async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ userMessage: 'test', scenario: 'error_mid_stream' }));
    expect(res.status).toBe(200);
    const events = parseSSEEvents(await res.text());
    const errorEvent = events.find((e: { type: string }) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.code).toBe('MODEL_STREAM_ERROR');
    expect(errorEvent.retryable).toBe(true);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe('turn.done');
    expect(lastEvent.partial).toBe(true);
  });

  it('rate_limit returns 429 with Retry-After', async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ userMessage: 'test', scenario: 'rate_limit' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('2');
    const body = await res.json();
    expect(body.error).toBe('RATE_LIMIT');
  });

  it('auth_error returns 401', async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ userMessage: 'test', scenario: 'auth_error' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('AUTH_ERROR');
  });

  it('network_drop ends stream without turn.done', async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ userMessage: 'test', scenario: 'network_drop' }));
    expect(res.status).toBe(200);
    const events = parseSSEEvents(await res.text());
    expect(events.length).toBeGreaterThan(0);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).not.toBe('turn.done');
  });

  it('malformed_event contains valid events around bad one', async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ userMessage: 'test', scenario: 'malformed_event' }));
    expect(res.status).toBe(200);
    const text = await res.text();
    // Should contain the broken JSON line
    expect(text).toContain('{broken json');
    // Should also contain valid events
    const events = parseSSEEvents(text.replace('data: {broken json\n\n', ''));
    expect(events.some((e: { type: string }) => e.type === 'turn.done')).toBe(true);
  });
});
