import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for the concurrent stream guard (activeStreams Set).
 * Mocks @/lib/server/openai to avoid real API calls while exercising
 * the non-mock code path in route.ts where the guard lives.
 */

// Mock the OpenAI module so createOpenAIClient doesn't fail in test env.
// The mock client's responses.create() returns a hanging promise to keep the
// stream alive long enough for the concurrent request to hit the guard.
let streamResolve: ((value?: unknown) => void) | null = null;

vi.mock('@/lib/server/openai', () => ({
  createOpenAIClient: vi.fn(() => ({
    responses: {
      create: () =>
        new Promise((_resolve) => {
          streamResolve = _resolve;
        }),
    },
  })),
  getModel: () => 'gpt-test',
  AGENT_SYSTEM_PROMPT: 'test prompt',
  DRAW_TOOL_DEFINITION: { type: 'function', name: 'emit_draw_batch', parameters: {} },
  SEMANTIC_DRAW_TOOL_DEFINITION: { type: 'function', name: 'emit_semantic_batch', parameters: {} },
  GRAPH_SCRIPT_TOOL_DEFINITION: { type: 'function', name: 'emit_graph_script', parameters: {} },
}));

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': body.sessionId as string ?? 'test-session', 'Origin': 'http://localhost' },
    body: JSON.stringify(body),
  });
}

describe('Concurrent stream guard', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.AGENT_STREAM_MODE = process.env.AGENT_STREAM_MODE;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    // Non-mock mode so the guard is reached; dummy key for env validation
    delete process.env.AGENT_STREAM_MODE;
    process.env.OPENAI_API_KEY = 'test-key-dummy';
    streamResolve = null;
  });

  afterEach(() => {
    if (savedEnv.AGENT_STREAM_MODE !== undefined) {
      process.env.AGENT_STREAM_MODE = savedEnv.AGENT_STREAM_MODE;
    } else {
      delete process.env.AGENT_STREAM_MODE;
    }
    if (savedEnv.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    // Resolve any hanging stream promise to avoid test leak
    streamResolve?.();
    vi.resetModules();
  });

  it('rejects second concurrent stream for same sessionId with 409', async () => {
    const { POST } = await import('@/app/api/agent/stream/route');
    const sessionId = `concurrent-guard-${Date.now()}`;
    const body = { sessionId, userMessage: 'first stream', history: [] };

    // First request — enters the guard, adds to activeStreams, starts streaming
    const res1 = await POST(makeRequest(body));
    expect(res1.status).toBe(200);

    // Second request with same sessionId while first is still active
    const res2 = await POST(makeRequest(body));
    expect(res2.status).toBe(409);
    const json = await res2.json();
    expect(json.error).toBe('CONCURRENT_STREAM');
  });

  it('allows new stream after previous stream completes', async () => {
    const { POST } = await import('@/app/api/agent/stream/route');
    const sessionId = `sequential-guard-${Date.now()}`;
    const body = { sessionId, userMessage: 'sequential test', history: [] };

    // First request — starts streaming
    const res1 = await POST(makeRequest(body));
    expect(res1.status).toBe(200);

    // Resolve the hanging promise so the stream finishes and activeStreams is cleaned up
    streamResolve?.();
    // Consume the stream to trigger the finally block
    try { await res1.text(); } catch { /* stream may error due to mock */ }

    // Brief yield to let microtasks flush
    await new Promise((r) => setTimeout(r, 20));

    // Second request should succeed now
    const res2 = await POST(makeRequest(body));
    expect(res2.status).toBe(200);
  });

  it('cleans up sessionId from activeStreams after stream error', async () => {
    // Override mock to throw during processing
    const openaiMock = await import('@/lib/server/openai');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createClient = openaiMock.createOpenAIClient as any;
    createClient.mockReturnValueOnce({
      responses: {
        create: () => Promise.reject(new Error('simulated API failure')),
      },
    });

    const { POST } = await import('@/app/api/agent/stream/route');
    const sessionId = `error-cleanup-${Date.now()}`;
    const body = { sessionId, userMessage: 'error test', history: [] };

    // First request — enters guard, throws during processing
    const res1 = await POST(makeRequest(body));
    expect(res1.status).toBe(200);
    // Consume stream to trigger the finally block which deletes from activeStreams
    try { await res1.text(); } catch { /* stream error expected */ }
    await new Promise((r) => setTimeout(r, 20));

    // Next request with same sessionId should succeed (not 409)
    const res2 = await POST(makeRequest(body));
    expect(res2.status).toBe(200);
  });

  it('handles rapid sequential requests without race on cleanup', async () => {
    const { POST } = await import('@/app/api/agent/stream/route');
    const sessionId = `rapid-sequential-${Date.now()}`;
    const body = { sessionId, userMessage: 'rapid test', history: [] };

    // First request
    const res1 = await POST(makeRequest(body));
    expect(res1.status).toBe(200);

    // Immediately resolve and consume
    streamResolve?.();
    try { await res1.text(); } catch { /* ok */ }
    await new Promise((r) => setTimeout(r, 10));

    // Second request immediately after
    (streamResolve as ((value?: unknown) => void) | null) = null;
    const res2 = await POST(makeRequest(body));
    expect(res2.status).toBe(200);

    // Resolve and consume second — streamResolve may have been re-assigned by the mock
    if (streamResolve) (streamResolve as (value?: unknown) => void)();
    try { await res2.text(); } catch { /* ok */ }
    await new Promise((r) => setTimeout(r, 10));

    // Third request — verifies no stale state
    const res3 = await POST(makeRequest(body));
    expect(res3.status).toBe(200);
  });
});
