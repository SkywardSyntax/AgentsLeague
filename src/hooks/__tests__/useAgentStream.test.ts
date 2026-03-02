import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentStream } from '../useAgentStream';

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

describe('useAgentStream', () => {
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
    // Simulate mid-stream abort: first chunk succeeds, second throws AbortError
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

    // Events before abort are delivered
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 'partial' }),
    );
    // AbortError must NOT propagate to onError
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
    // First run: network error
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

    // Second run: succeeds
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
    // First run: aborted mid-stream
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
    // AbortError suppressed
    expect(onError1).not.toHaveBeenCalled();

    // Second run: succeeds
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
    // Should not throw
    expect(() => result.current.cancel()).not.toThrow();
  });
});

