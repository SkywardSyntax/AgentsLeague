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

/**
 * Parse an SSE buffer into decoded event objects. Returns parsed events,
 * the leftover (incomplete) buffer tail, and any JSON parse errors.
 */
export function parseSSEFrames(
  buffer: string,
): { events: unknown[]; remaining: string; errors: string[] } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const remaining = parts.pop() ?? '';
  const events: unknown[] = [];
  const errors: string[] = [];
  for (const chunk of parts) {
    for (const line of chunk.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('data:'))) {
      const json = line.slice(5).trim();
      if (!json) continue;
      try { events.push(JSON.parse(json)); }
      catch { errors.push('Invalid SSE JSON payload received'); }
    }
  }
  return { events, remaining, errors };
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

          const { events, remaining, errors } = parseSSEFrames(buffer);
          buffer = remaining;
          for (const error of errors) args.handlers.onError(error);
          for (const event of events) args.handlers.onEvent(event as AgentSSEEvent);
        }

        const { events, errors } = parseSSEFrames(buffer + '\n\n');
        for (const error of errors) args.handlers.onError(error);
        for (const event of events) args.handlers.onEvent(event as AgentSSEEvent);
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
