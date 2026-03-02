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
  createOpenAIClient: () => ({
    responses: {
      create: () =>
        new Promise((_resolve) => {
          streamResolve = _resolve;
        }),
    },
  }),
  getModel: () => 'gpt-test',
  AGENT_SYSTEM_PROMPT: 'test prompt',
  DRAW_TOOL_DEFINITION: { type: 'function', name: 'emit_draw_batch', parameters: {} },
  SEMANTIC_DRAW_TOOL_DEFINITION: { type: 'function', name: 'emit_semantic_batch', parameters: {} },
  GRAPH_SCRIPT_TOOL_DEFINITION: { type: 'function', name: 'emit_graph_script', parameters: {} },
}));

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
});
