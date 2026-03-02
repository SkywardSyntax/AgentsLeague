'use client';

import { useCallback, useRef } from 'react';
import type {
  AgentSSEEvent,
  ChatMessage,
  PlannerMode,
  StructuredWhiteboardContext,
  WhiteboardContext,
} from '@/types/agent';
import { isValidAgentSSEEvent } from '@/lib/client/event-validator';

export interface StreamHandlers {
  onEvent: (event: AgentSSEEvent) => void;
  onError: (message: string) => void;
}

/** Determine whether a failed stream attempt should be retried. */
function shouldRetry(
  lastEvent: AgentSSEEvent | null,
  httpStatus: number | null,
  error: unknown,
): { retry: boolean; reason: string } {
  // Stream completed normally (even if partial) — don't retry
  if (lastEvent?.type === 'turn.done') {
    return { retry: false, reason: 'turn_completed' };
  }
  // Abort by user
  if ((error as { name?: string })?.name === 'AbortError') {
    return { retry: false, reason: 'aborted' };
  }
  // HTTP-level errors
  if (httpStatus != null) {
    if (httpStatus === 429) return { retry: true, reason: 'rate_limited' };
    if (httpStatus === 408) return { retry: true, reason: 'request_timeout' };
    if (httpStatus === 503) return { retry: true, reason: 'service_unavailable' };
    if (httpStatus >= 400 && httpStatus < 500) return { retry: false, reason: `http_${httpStatus}` };
    if (httpStatus >= 500) return { retry: true, reason: `http_${httpStatus}` };
  }
  // Last SSE event was a retryable error
  if (lastEvent?.type === 'error' && lastEvent.retryable) {
    return { retry: true, reason: lastEvent.code };
  }
  if (lastEvent?.type === 'error' && !lastEvent.retryable) {
    return { retry: false, reason: lastEvent.code };
  }
  // Network error / abrupt close — retryable
  if (error instanceof Error) {
    return { retry: true, reason: 'network_error' };
  }
  return { retry: true, reason: 'unknown' };
}

function computeDelay(attempt: number, reason: string, retryAfterMs?: number): number {
  // Slower backoff for rate limits
  const baseMs = reason === 'rate_limited' ? 2000 : 1000;
  const exponential = Math.min(baseMs * 2 ** attempt, 8000);
  // ±20% jitter
  const jitter = exponential * (0.8 + Math.random() * 0.4);
  // Respect server-specified retry-after
  return retryAfterMs != null ? Math.max(retryAfterMs, jitter) : jitter;
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
      maxRetries?: number;
      onRetry?: (attempt: number, delayMs: number, reason: string) => void;
    }) => {
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      const maxRetries = args.maxRetries ?? 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let lastEvent: AgentSSEEvent | null = null;
        let httpStatus: number | null = null;
        let caughtError: unknown = null;

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

          httpStatus = res.status;

          if (!res.ok || !res.body) {
            // Check if retryable at HTTP level
            const decision = shouldRetry(null, httpStatus, null);
            if (decision.retry && attempt < maxRetries) {
              const delayMs = computeDelay(attempt, decision.reason);
              args.onRetry?.(attempt + 1, delayMs, decision.reason);
              await retrySleep(delayMs, controller.signal);
              continue;
            }
            args.handlers.onError(`Stream request failed with status ${res.status}`);
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let consecutiveFailures = 0;
          const MAX_CONSECUTIVE_FAILURES = 5;
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
                  const parsed = JSON.parse(json);
                  if (!isValidAgentSSEEvent(parsed)) {
                    consecutiveFailures++;
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                      args.handlers.onError('Stream corrupted — too many malformed events');
                      return;
                    }
                    continue;
                  }
                  consecutiveFailures = 0;
                  lastEvent = parsed;
                  args.handlers.onEvent(parsed);
                } catch {
                  consecutiveFailures++;
                  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    args.handlers.onError('Stream corrupted — too many malformed events');
                    return;
                  }
                }
              }
            }
          }

          const trailing = buffer.trim();
          if (trailing.startsWith('data:')) {
            const json = trailing.slice(5).trim();
            if (json) {
              try {
                const parsed = JSON.parse(json);
                if (isValidAgentSSEEvent(parsed)) {
                  lastEvent = parsed;
                  args.handlers.onEvent(parsed);
                }
              } catch {
                // Ignore trailing parse error
              }
            }
          }

          // Stream ended — check if we should retry
          const decision = shouldRetry(lastEvent, httpStatus, null);
          if (decision.retry && attempt < maxRetries) {
            const retryAfterMs = lastEvent?.type === 'error' ? lastEvent.retryAfterMs : undefined;
            const delayMs = computeDelay(attempt, decision.reason, retryAfterMs);
            args.onRetry?.(attempt + 1, delayMs, decision.reason);
            await retrySleep(delayMs, controller.signal);
            continue;
          }
          // Stream completed (or non-retryable) — stop
          return;
        } catch (error) {
          caughtError = error;
          if ((error as { name?: string })?.name === 'AbortError') return;

          const decision = shouldRetry(lastEvent, httpStatus, error);
          if (decision.retry && attempt < maxRetries) {
            const delayMs = computeDelay(attempt, decision.reason);
            args.onRetry?.(attempt + 1, delayMs, decision.reason);
            try {
              await retrySleep(delayMs, controller.signal);
            } catch {
              return; // abort during sleep
            }
            continue;
          }
          args.handlers.onError(caughtError instanceof Error ? caughtError.message : 'Stream aborted unexpectedly');
          return;
        }
      }
    },
    [cancel],
  );

  return { run, cancel };
}

/** Sleep that can be cancelled by an AbortSignal. */
function retrySleep(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
