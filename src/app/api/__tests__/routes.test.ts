/**
 * Tests for API route handlers: /api/draw, /api/chat, /api/health.
 *
 * OpenAI client is mocked so tests run without an API key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetRateLimitStore } from '@/lib/rate-limit';

// ── Mock OpenAI ────────────────────────────────────────────

function createMockStream(chunks: { type: string; delta?: string; message?: string }[]) {
  return {
    controller: { abort: vi.fn() },
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

const mockCreate = vi.fn();
const mockModelsList = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      responses = { create: mockCreate };
      models = { list: mockModelsList };
    },
  };
});

// ── Helpers ────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/draw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function collectSSE(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  const events: Record<string, unknown>[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
    }
  }
  return events;
}

// ── Tests ──────────────────────────────────────────────────

describe('POST /api/draw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitStore();
    process.env.OPENAI_API_KEY = 'sk-test-key';
  });

  it('returns 400 for missing userMessage', async () => {
    const { POST } = await import('@/app/api/draw/route');
    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty userMessage', async () => {
    const { POST } = await import('@/app/api/draw/route');
    const req = makeRequest({ userMessage: '' });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it('streams draw_op events from OpenAI response', async () => {
    const ops = JSON.stringify([{ op: 'add', element: { id: '1', type: 'rect', x: 10, y: 20 } }]);
    mockCreate.mockResolvedValueOnce(
      createMockStream([
        { type: 'response.output_text.delta', delta: ops },
        { type: 'response.completed' },
      ]),
    );

    const { POST } = await import('@/app/api/draw/route');
    const req = makeRequest({ userMessage: 'Draw a rectangle' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');

    const events = await collectSSE(res);
    const drawOps = events.filter((e) => e.type === 'draw_op');
    expect(drawOps.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('handles streaming errors gracefully', async () => {
    mockCreate.mockResolvedValueOnce(
      createMockStream([{ type: 'error', message: 'Something went wrong' }]),
    );

    const { POST } = await import('@/app/api/draw/route');
    const req = makeRequest({ userMessage: 'Draw something' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const events = await collectSSE(res);
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.code).toBe('STREAM_ERROR');
  });

  it('handles OpenAI API errors (429 rate limit)', async () => {
    const error = new Error('Rate limit exceeded');
    Object.assign(error, { status: 429, message: 'Rate limit exceeded' });
    mockCreate.mockRejectedValueOnce(error);

    const { POST } = await import('@/app/api/draw/route');
    const req = makeRequest({ userMessage: 'Draw' });
    const res = await POST(req);

    expect(res.status).toBe(429);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('OPENAI_RATE_LIMIT');
    expect(body.retryAfter).toBeDefined();
  });

  it('returns 429 when rate limited', async () => {
    const { POST } = await import('@/app/api/draw/route');

    // Exhaust rate limit (20 requests)
    for (let i = 0; i < 20; i++) {
      mockCreate.mockResolvedValueOnce(createMockStream([{ type: 'response.completed' }]));
      await POST(makeRequest({ userMessage: `Draw ${i}` }));
    }

    // 21st request should be rate limited
    const res = await POST(makeRequest({ userMessage: 'Draw more' }));
    expect(res.status).toBe(429);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('RATE_LIMITED');
  });

  it('accepts conversationHistory', async () => {
    mockCreate.mockResolvedValueOnce(
      createMockStream([{ type: 'response.completed' }]),
    );

    const { POST } = await import('@/app/api/draw/route');
    const req = makeRequest({
      userMessage: 'Make it bigger',
      conversationHistory: [
        { role: 'user', content: 'Draw a circle' },
        { role: 'assistant', content: 'Done' },
      ],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        input: expect.arrayContaining([
          { role: 'user', content: 'Draw a circle' },
          { role: 'assistant', content: 'Done' },
          { role: 'user', content: 'Make it bigger' },
        ]),
      }),
      expect.anything(),
    );
  });
});

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitStore();
    process.env.OPENAI_API_KEY = 'sk-test-key';
  });

  it('returns 400 for missing userMessage', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it('streams message events', async () => {
    mockCreate.mockResolvedValueOnce(
      createMockStream([
        { type: 'response.output_text.delta', delta: 'Hello' },
        { type: 'response.output_text.delta', delta: ' world' },
      ]),
    );

    const { POST } = await import('@/app/api/chat/route');
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Hi' }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const events = await collectSSE(res);
    const messages = events.filter((e) => e.type === 'message');
    expect(messages.length).toBe(2);
    expect(messages[0]!.data).toBe('Hello');
    expect(messages[1]!.data).toBe(' world');
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test-key';
  });

  it('returns ok with openai_connected true when OpenAI is reachable', async () => {
    mockModelsList.mockResolvedValueOnce({ data: [] });

    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.openai_connected).toBe(true);
  });

  it('returns ok with openai_connected false when OpenAI is unreachable', async () => {
    mockModelsList.mockRejectedValueOnce(new Error('Network error'));

    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.openai_connected).toBe(false);
  });
});

describe('SSE format', () => {
  it('toSSE produces correct wire format', async () => {
    const { toSSE } = await import('@/lib/api-utils/streaming');
    const bytes = toSSE({ type: 'draw_op', op: 'rect', x: 10, y: 20 });
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe('data: {"type":"draw_op","op":"rect","x":10,"y":20}\n\n');
  });

  it('writeError produces error SSE frame', async () => {
    const { writeError } = await import('@/lib/api-utils/streaming');
    const bytes = writeError('timeout', 'Request timed out');
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe('data: {"type":"error","code":"timeout","message":"Request timed out"}\n\n');
  });
});
