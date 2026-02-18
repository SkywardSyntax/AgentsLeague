/**
 * React hook for streaming OpenAI draw tool calls via the /api/draw endpoint.
 *
 * Manages a tool-loop state machine:
 *   IDLE → PROCESSING → DRAWING → PROCESSING → IDLE
 *
 * Returns an async iterator of draw operations with cancellation support.
 */

'use client';

import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import type { Message } from '@/types/interaction';
import type { DrawToolArgs, DrawToolElement } from '@/lib/openai/tools';
import { deduplicatedFetch, debounce } from '@/utils/api-client';

// ── State machine ───────────────────────────────────────────────────

export enum StreamState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  DRAWING = 'drawing',
}

// ── Stream chunk types ──────────────────────────────────────────────

export interface StreamChunk {
  ops: DrawToolElement[];
  step_summary: string;
  done: boolean;
  error?: string;
}

// ── SSE event types from /api/draw ──────────────────────────────────

interface ToolStartEvent {
  event: 'tool_start';
  name: string;
}

interface PartialSpecEvent {
  event: 'partial_spec';
  elements: DrawToolElement[];
}

interface CompleteSpecEvent {
  event: 'complete_spec';
  spec: DrawToolArgs;
}

interface ErrorEvent {
  event: 'error';
  detail: string;
}

interface DoneEvent {
  event: 'done';
}

type SSEEvent = ToolStartEvent | PartialSpecEvent | CompleteSpecEvent | ErrorEvent | DoneEvent;

// ── Hook options ────────────────────────────────────────────────────

export interface UseOpenAIStreamOptions {
  endpoint?: string;
  onChunk?: (chunk: StreamChunk) => void;
  onError?: (error: Error) => void;
  onComplete?: (spec: DrawToolArgs) => void;
  onStateChange?: (state: StreamState) => void;
}

// ── Hook implementation ─────────────────────────────────────────────

export function useOpenAIStream(options: UseOpenAIStreamOptions = {}) {
  const { endpoint = '/api/draw', onChunk, onError, onComplete, onStateChange } = options;

  const [state, setState] = useState<StreamState>(StreamState.IDLE);
  const [lastSpec, setLastSpec] = useState<DrawToolArgs | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seenElementsRef = useRef<Set<string>>(new Set());

  const transition = useCallback(
    (newState: StreamState) => {
      setState(newState);
      onStateChange?.(newState);
    },
    [onStateChange]
  );

  /** Process a single SSE event and update state. */
  const processSSEEvent = useCallback(
    (event: SSEEvent, currentSpec: DrawToolArgs | null): DrawToolArgs | null => {
      switch (event.event) {
        case 'tool_start':
          transition(StreamState.DRAWING);
          onChunk?.({ ops: [], step_summary: `Drawing with ${event.name}…`, done: false });
          return currentSpec;

        case 'partial_spec': {
          const newElements = event.elements.filter((el) => !seenElementsRef.current.has(el.id));
          for (const el of newElements) {
            seenElementsRef.current.add(el.id);
          }
          if (newElements.length > 0) {
            onChunk?.({
              ops: newElements,
              step_summary: `Rendered ${seenElementsRef.current.size} elements`,
              done: false,
            });
          }
          return currentSpec;
        }

        case 'complete_spec':
          transition(StreamState.PROCESSING);
          onChunk?.({
            ops: event.spec.elements,
            step_summary: `Complete: ${event.spec.elements.length} elements`,
            done: true,
          });
          return event.spec;

        case 'error':
          onChunk?.({ ops: [], step_summary: '', done: true, error: event.detail });
          onError?.(new Error(event.detail));
          return currentSpec;

        case 'done':
          onChunk?.({ ops: [], step_summary: 'Done', done: true });
          return currentSpec;

        default:
          return currentSpec;
      }
    },
    [transition, onChunk, onError]
  );

  /**
   * Stream a drawing request. Returns a promise that resolves when
   * the full spec is received or the stream is aborted.
   */
  const streamDrawing = useCallback(
    async (
      userMessage: string,
      conversationHistory: Message[] = []
    ): Promise<DrawToolArgs | null> => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      seenElementsRef.current.clear();

      transition(StreamState.PROCESSING);

      try {
        const response = await deduplicatedFetch('draw-stream', endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: userMessage,
            history: conversationHistory.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalSpec: DrawToolArgs | null = null;

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
              const event = JSON.parse(data) as SSEEvent;
              finalSpec = processSSEEvent(event, finalSpec);
            } catch {
              // Skip malformed chunks
            }
          }
        }

        // Process remaining buffer
        if (buffer.startsWith('data: ')) {
          const data = buffer.slice(6).trim();
          if (data && data !== '[DONE]') {
            try {
              const event = JSON.parse(data) as SSEEvent;
              finalSpec = processSSEEvent(event, finalSpec);
            } catch {
              // skip
            }
          }
        }

        if (finalSpec) {
          setLastSpec(finalSpec);
          onComplete?.(finalSpec);
        }

        transition(StreamState.IDLE);
        return finalSpec;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          transition(StreamState.IDLE);
          return null;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        onChunk?.({ ops: [], step_summary: '', done: true, error: error.message });
        transition(StreamState.IDLE);
        return null;
      }
    },
    [endpoint, onChunk, onError, onComplete, transition, processSSEEvent]
  );

  /** Cancel any in-flight stream. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    transition(StreamState.IDLE);
  }, [transition]);

  /** Debounced version of streamDrawing (300ms) for rapid canvas changes. */
  const debouncedStreamDrawing = useMemo(
    () =>
      debounce((userMessage: string, conversationHistory: Message[] = []) => {
        void streamDrawing(userMessage, conversationHistory);
      }, 300),
    [streamDrawing]
  );

  // Cancel pending debounced call on unmount
  useEffect(() => {
    return () => {
      debouncedStreamDrawing.cancel?.();
    };
  }, [debouncedStreamDrawing]);

  return {
    streamDrawing,
    debouncedStreamDrawing,
    cancel,
    state,
    lastSpec,
    isStreaming: state !== StreamState.IDLE,
  } as const;
}
