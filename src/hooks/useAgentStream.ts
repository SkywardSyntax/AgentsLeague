'use client';

import { useCallback, useRef } from 'react';
import type {
  AgentSSEEvent,
  ChatMessage,
  PlannerMode,
  StructuredWhiteboardContext,
  WhiteboardContext,
} from '@/types/agent';
import { parseSSEBuffer } from './sse-parser';

export interface StreamHandlers {
  onEvent: (event: AgentSSEEvent) => void;
  onError: (message: string) => void;
}

export function useAgentStream() {
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const run = useCallback(
    async (args: {
      sessionId: string;
      userMessage: string;
      history: ChatMessage[];
      plannerMode?: PlannerMode;
      whiteboardContext?: WhiteboardContext;
      whiteboardContextV2?: StructuredWhiteboardContext;
      handlers: StreamHandlers;
    }) => {
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/agent/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          cache: 'no-store',
          body: JSON.stringify({
              sessionId: args.sessionId,
              userMessage: args.userMessage,
              history: args.history,
              plannerMode: args.plannerMode,
              whiteboardContext: args.whiteboardContext,
              whiteboardContextV2: args.whiteboardContextV2,
            }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          args.handlers.onError(`Stream request failed with status ${res.status}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const result = parseSSEBuffer(buffer);
          buffer = result.remaining;
          for (const event of result.events) {
            args.handlers.onEvent(event as AgentSSEEvent);
          }
          for (const err of result.errors) {
            args.handlers.onError(err);
          }
        }

        // flush trailing buffer
        if (buffer.trim()) {
          const result = parseSSEBuffer(buffer + '\n\n');
          for (const event of result.events) {
            args.handlers.onEvent(event as AgentSSEEvent);
          }
          for (const err of result.errors) {
            args.handlers.onError(err);
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        args.handlers.onError(error instanceof Error ? error.message : 'Stream aborted unexpectedly');
      } finally {
        abortRef.current = null;
      }
    },
    [cancel],
  );

  return { run, cancel };
}
