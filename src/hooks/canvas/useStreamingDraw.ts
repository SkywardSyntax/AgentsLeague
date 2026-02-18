'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawElement, DrawOp } from '@/types';
import {
  StreamingDrawController,
  type VisibleElement,
} from '@/lib/performance/StreamingDrawController';

// ── Public hook state ───────────────────────────────────────────────

export interface StreamingDrawState {
  /** Current visible elements (with animation data). */
  visibleElements: readonly VisibleElement[];
  /** Drawing progress 0–100. */
  progress: number;
  /** Whether the stream is actively receiving ops. */
  isStreaming: boolean;
  /** Whether all animations have completed. */
  isComplete: boolean;
}

export interface StreamingDrawActions {
  /** Begin consuming an SSE stream. */
  start: (prompt: string, endpoint?: string) => Promise<void>;
  /** Stop the current stream. */
  stop: () => void;
  /** Pause animations (freeze in place). */
  pause: () => void;
  /** Resume animations. */
  resume: () => void;
  /** Reset to empty state. */
  reset: () => void;
}

export interface UseStreamingDrawOptions {
  /** Default SSE endpoint. */
  endpoint?: string;
  /** Stagger delay between element animations (ms). */
  staggerMs?: number;
  /** Expected element count (improves progress accuracy). */
  expectedCount?: number;
  /** Called when first element arrives. */
  onFirstElement?: (element: DrawElement) => void;
  /** Called when all ops are applied and animations finish. */
  onComplete?: () => void;
  /** Called on errors. */
  onError?: (error: Error) => void;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useStreamingDraw(
  options: UseStreamingDrawOptions = {},
): [StreamingDrawState, StreamingDrawActions] {
  const {
    endpoint = '/api/draw',
    staggerMs,
    expectedCount,
    onFirstElement,
    onComplete,
    onError,
  } = options;

  const [state, setState] = useState<StreamingDrawState>({
    visibleElements: [],
    progress: 0,
    isStreaming: false,
    isComplete: false,
  });

  const controllerRef = useRef<StreamingDrawController | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Stable callback refs to avoid re-creating controller on every render
  const onFirstElementRef = useRef(onFirstElement);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onFirstElementRef.current = onFirstElement;
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  // Lazily create controller
  const getController = useCallback((): StreamingDrawController => {
    if (!controllerRef.current) {
      controllerRef.current = new StreamingDrawController(
        {
          onFrame: (elements, progress) => {
            setState((prev) => ({
              ...prev,
              visibleElements: elements,
              progress,
            }));
          },
          onFirstElement: (el) => onFirstElementRef.current?.(el),
          onComplete: () => {
            setState((prev) => ({ ...prev, isComplete: true, isStreaming: false }));
            onCompleteRef.current?.();
          },
          onError: (err) => onErrorRef.current?.(err),
        },
        staggerMs !== undefined ? { staggerMs } : {},
      );
    }
    return controllerRef.current;
  }, [staggerMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
      abortRef.current?.abort();
    };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────

  const start = useCallback(
    async (prompt: string, overrideEndpoint?: string) => {
      // Abort any in-flight stream
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const ctrl = getController();
      ctrl.reset();
      if (expectedCount) ctrl.setExpectedCount(expectedCount);

      setState({
        visibleElements: [],
        progress: 0,
        isStreaming: true,
        isComplete: false,
      });

      try {
        const response = await fetch(overrideEndpoint ?? endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: abort.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const op = JSON.parse(data) as DrawOp;
              ctrl.push(op);
            } catch {
              // Skip malformed chunks
            }
          }
        }

        ctrl.finish();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, isStreaming: false }));
        onErrorRef.current?.(error);
      }
    },
    [endpoint, expectedCount, getController],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  const pause = useCallback(() => {
    controllerRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    controllerRef.current?.resume();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    controllerRef.current?.reset();
    setState({
      visibleElements: [],
      progress: 0,
      isStreaming: false,
      isComplete: false,
    });
  }, []);

  return [state, { start, stop, pause, resume, reset }];
}
