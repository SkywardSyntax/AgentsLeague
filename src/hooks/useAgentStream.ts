'use client';

import { useCallback, useRef } from 'react';
import type {
  AgentSSEEvent,
  ChatMessage,
  PlannerMode,
  StructuredWhiteboardContext,
  WhiteboardContext,
} from '@/types/agent';

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
        const splitChunks = (raw: string) => raw.split(/\r?\n\r?\n/);

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = splitChunks(buffer);
          if (parts.length <= 1) continue;

          buffer = parts.pop() ?? '';
          for (const chunk of parts) {
            const lines = chunk
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter((line) => line.startsWith('data:'));
            for (const line of lines) {
              const json = line.slice(5).trim();
              if (!json) continue;
              try {
                const event = JSON.parse(json) as AgentSSEEvent;
                args.handlers.onEvent(event);
              } catch {
                args.handlers.onError('Invalid SSE JSON payload received');
              }
            }
          }
        }

        const trailing = buffer.trim();
        if (trailing.startsWith('data:')) {
          const json = trailing.slice(5).trim();
          if (json) {
            try {
              args.handlers.onEvent(JSON.parse(json) as AgentSSEEvent);
            } catch {
              args.handlers.onError('Invalid trailing SSE JSON payload received');
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof Error && error.name === 'AbortError') return;
        args.handlers.onError(error instanceof Error ? error.message : 'Stream aborted unexpectedly');
      } finally {
        abortRef.current = null;
      }
    },
    [cancel],
  );

  return { run, cancel };
}
