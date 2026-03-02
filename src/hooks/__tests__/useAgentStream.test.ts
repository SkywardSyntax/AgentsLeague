import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentStream } from '../useAgentStream';

// ── Helpers ────────────────────────────────────────────────────────────

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
