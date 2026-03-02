import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentStream, type StreamHandlers } from '../useAgentStream';
import type { ChatMessage } from '@/types/agent';

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

/** Build a ReadableStream that emits the given string as a single chunk. */
function sseStream(raw: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(raw));
      controller.close();
    },
  });
}

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
