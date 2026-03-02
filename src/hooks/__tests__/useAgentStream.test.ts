import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentStream, type StreamHandlers } from '../useAgentStream';
import type { ChatMessage } from '@/types/agent';

// ── Helpers (HEAD) ─────────────────────────────────────────────────────

function makeSSEStream(events: Array<{ type: string; [k: string]: unknown }>) {
  const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]!));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function makeArgs(overrides: Partial<StreamHandlers> = {}) {
  return {
    sessionId: 's1',
    userMessage: 'hi',
    history: [] as ChatMessage[],
    handlers: {
      onEvent: overrides.onEvent ?? vi.fn(),
      onError: overrides.onError ?? vi.fn(),
    } satisfies StreamHandlers,
  };
}

function sseStream(raw: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(raw));
      controller.close();
    },
  });
}

function makeFetchResponse(body: ReadableStream<Uint8Array>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  } as unknown as Response;
}

function baseArgs(handlers: { onEvent: (e: unknown) => void; onError: (msg: string) => void }) {
  return {
    sessionId: 'test-session',
    userMessage: 'hello',
    history: [],
    handlers,
  };
}

// ── Helpers (lane-07) ──────────────────────────────────────────────────

/** Create a ReadableStream from an array of string chunks. */
function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

function mockFetchWithBody(body: ReadableStream<Uint8Array> | null, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(body, {
      status,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
}

/**
 * Create a mock response whose reader throws AbortError on second read.
 * This simulates what browsers do when fetch abort signal fires mid-stream.
 */
function mockFetchWithAbortableReader(firstChunk?: string) {
  const encoder = new TextEncoder();
  const abortError = new DOMException('The operation was aborted', 'AbortError');
  const mockReader = {
    read: firstChunk
      ? vi.fn()
          .mockResolvedValueOnce({
            value: encoder.encode(firstChunk),
            done: false,
          })
          .mockRejectedValueOnce(abortError)
      : vi.fn().mockRejectedValueOnce(abortError),
  };

  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    status: 200,
    body: { getReader: () => mockReader },
  } as unknown as Response);

  return mockReader;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('useAgentStream', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('dispatches onEvent for each parsed SSE event', async () => {
    const events = [
      { type: 'assistant.text.delta', turnId: 't1', delta: 'Hello' },
      { type: 'assistant.text.done', turnId: 't1', messageId: 'm1' },
      { type: 'turn.done', turnId: 't1' },
    ];
    fetchSpy.mockResolvedValueOnce(makeFetchResponse(makeSSEStream(events)));

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(async () => {
      await result.current.run(baseArgs({ onEvent, onError }));
    });

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'assistant.text.delta', delta: 'Hello' }));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'turn.done' }));
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when fetch returns non-ok status', async () => {
    fetchSpy.mockResolvedValueOnce(makeFetchResponse(makeSSEStream([]), 500));

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(async () => {
      await result.current.run(baseArgs({ onEvent, onError }));
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('500'));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('calls onError on malformed JSON but processes subsequent valid chunks', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {invalid json}\n\n',
      `data: ${JSON.stringify({ type: 'turn.done', turnId: 't1' })}\n\n`,
    ];
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]!));
          index++;
        } else {
          controller.close();
        }
      },
    });
    fetchSpy.mockResolvedValueOnce(makeFetchResponse(stream));

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(async () => {
      await result.current.run(baseArgs({ onEvent, onError }));
    });

    expect(onError).toHaveBeenCalledWith('Invalid SSE JSON payload received');
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'turn.done' }));
  });

  it('calls onError on network failure and surfaces the error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(async () => {
      await result.current.run(baseArgs({ onEvent, onError }));
    });

    expect(onError).toHaveBeenCalledWith('Network failure');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('silently swallows AbortError on cancel without calling onError', async () => {
    fetchSpy.mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        // Simulate delayed abort
        setTimeout(() => {
          const err = new DOMException('Aborted', 'AbortError');
          reject(err);
        }, 10);
      });
    });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(async () => {
      const runPromise = result.current.run(baseArgs({ onEvent, onError }));
      result.current.cancel();
      await runPromise;
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('does not dispatch phantom error from previous run on double-run()', async () => {
    // First run: will reject with a non-AbortError after a delay (simulating JSON parse error mid-abort)
    let rejectFirst: ((e: Error) => void) | null = null;
    fetchSpy.mockImplementationOnce(() => {
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    });

    // Second run: succeeds normally
    const events2 = [{ type: 'turn.done', turnId: 't2' }];
    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(makeFetchResponse(makeSSEStream(events2))),
    );

    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    // Start first run
    let firstDone = false;
    await act(async () => {
      const firstPromise = result.current.run(baseArgs({ onEvent, onError }));
      firstPromise.then(() => { firstDone = true; });

      // Start second run (which cancels first)
      await result.current.run(baseArgs({ onEvent, onError }));
    });

    // Now the first fetch's rejection fires late — but generation counter should prevent dispatch
    if (rejectFirst) {
      await act(async () => {
        rejectFirst!(new Error('Parse error from aborted stream'));
        // Give microtask queue time to settle
        await new Promise((r) => setTimeout(r, 0));
      });
    }

    // onError should NOT be called from the stale first run
    expect(onError).not.toHaveBeenCalled();
    // onEvent should have the second run's events
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'turn.done' }));
  });
});

describe('useAgentStream error paths', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('HTTP 500 calls onError with status message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, body: null }),
    );
    const onError = vi.fn();
    const onEvent = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(() =>
      result.current.run(makeArgs({ onEvent, onError })),
    );

    expect(onError).toHaveBeenCalledWith(
      'Stream request failed with status 500',
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('malformed SSE JSON calls onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: sseStream('data: {not valid json}\n\n'),
      }),
    );
    const onError = vi.fn();
    const onEvent = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(() =>
      result.current.run(makeArgs({ onEvent, onError })),
    );

    expect(onError).toHaveBeenCalledWith('Invalid SSE JSON payload received');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('network failure (fetch throws) calls onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(() =>
      result.current.run(makeArgs({ onError })),
    );

    expect(onError).toHaveBeenCalledWith('Failed to fetch');
  });

  it('AbortError does NOT call onError', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(abortError),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useAgentStream());

    await act(() =>
      result.current.run(makeArgs({ onError })),
    );

    expect(onError).not.toHaveBeenCalled();
  });
});

// ── Lane-07 tests ──────────────────────────────────────────────────────

describe('useAgentStream (lane-07 extended)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers parsed events from a successful stream', async () => {
    const body = chunkedStream([
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"hi"}\n\n',
      'data: {"type":"turn.done","turnId":"t1"}\n\n',
    ]);
    mockFetchWithBody(body);
    const onEvent = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'hello',
        history: [],
        handlers: { onEvent, onError },
      }),
    );

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'assistant.text.delta', delta: 'hi' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'turn.done' }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError for non-200 response', async () => {
    mockFetchWithBody(null, 500);
    const onEvent = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'hello',
        history: [],
        handlers: { onEvent, onError },
      }),
    );

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('500'));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('calls onError when response has no body', async () => {
    mockFetchWithBody(null, 200);
    const onEvent = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'hello',
        history: [],
        handlers: { onEvent, onError },
      }),
    );

    expect(onError).toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('flushes trailing buffer that lacks final delimiter', async () => {
    const body = chunkedStream([
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"buffered"}',
    ]);
    mockFetchWithBody(body);
    const onEvent = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'hello',
        history: [],
        handlers: { onEvent, onError },
      }),
    );

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 'buffered' }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('accumulates multi-chunk buffer before emitting events', async () => {
    const body = chunkedStream([
      'data: {"type":"assistant.text.de',
      'lta","turnId":"t1","delta":"split"}\n\n',
    ]);
    mockFetchWithBody(body);
    const onEvent = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'hello',
        history: [],
        handlers: { onEvent, onError },
      }),
    );

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 'split' }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('propagates parse errors via onError while continuing stream', async () => {
    const body = chunkedStream([
      'data: {bad json}\n\n',
      'data: {"type":"turn.done","turnId":"t1"}\n\n',
    ]);
    mockFetchWithBody(body);
    const onEvent = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'hello',
        history: [],
        handlers: { onEvent, onError },
      }),
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Invalid SSE JSON'));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'turn.done' }),
    );
  });

  it('AbortError from reader is suppressed silently', async () => {
    mockFetchWithAbortableReader(
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"partial"}\n\n',
    );
    const onEvent = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'hello',
        history: [],
        handlers: { onEvent, onError },
      }),
    );

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 'partial' }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('network error during stream calls onError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const onEvent = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'hello',
        history: [],
        handlers: { onEvent, onError },
      }),
    );

    expect(onError).toHaveBeenCalledWith('Failed to fetch');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('recovers after error — can run a new stream successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Network down'));
    const onError1 = vi.fn();
    const onEvent1 = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'fail',
        history: [],
        handlers: { onEvent: onEvent1, onError: onError1 },
      }),
    );
    expect(onError1).toHaveBeenCalledWith('Network down');

    const body2 = chunkedStream([
      'data: {"type":"assistant.text.delta","turnId":"t1","delta":"ok"}\n\n',
    ]);
    mockFetchWithBody(body2);
    const onEvent2 = vi.fn();
    const onError2 = vi.fn();

    await act(() =>
      result.current.run({
        sessionId: 's2',
        userMessage: 'retry',
        history: [],
        handlers: { onEvent: onEvent2, onError: onError2 },
      }),
    );

    expect(onEvent2).toHaveBeenCalledTimes(1);
    expect(onEvent2).toHaveBeenCalledWith(expect.objectContaining({ delta: 'ok' }));
    expect(onError2).not.toHaveBeenCalled();
  });

  it('recovers after abort — can run a new stream successfully', async () => {
    mockFetchWithAbortableReader();
    const onError1 = vi.fn();
    const onEvent1 = vi.fn();

    const { result } = renderHook(() => useAgentStream());
    await act(() =>
      result.current.run({
        sessionId: 's1',
        userMessage: 'aborted',
        history: [],
        handlers: { onEvent: onEvent1, onError: onError1 },
      }),
    );
    expect(onError1).not.toHaveBeenCalled();

    const body2 = chunkedStream([
      'data: {"type":"turn.done","turnId":"t2"}\n\n',
    ]);
    mockFetchWithBody(body2);
    const onEvent2 = vi.fn();
    const onError2 = vi.fn();

    await act(() =>
      result.current.run({
        sessionId: 's2',
        userMessage: 'retry',
        history: [],
        handlers: { onEvent: onEvent2, onError: onError2 },
      }),
    );

    expect(onEvent2).toHaveBeenCalledTimes(1);
    expect(onEvent2).toHaveBeenCalledWith(expect.objectContaining({ type: 'turn.done' }));
    expect(onError2).not.toHaveBeenCalled();
  });

  it('cancel() is safe to call when no stream is active', () => {
    const { result } = renderHook(() => useAgentStream());
    expect(() => result.current.cancel()).not.toThrow();
  });
});
