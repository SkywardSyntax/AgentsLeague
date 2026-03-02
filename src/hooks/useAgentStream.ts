'use client';

import { useCallback, useEffect, useRef } from 'react';
import type {
  ChatMessage,
  PlannerMode,
  StructuredWhiteboardContext,
  WhiteboardContext,
} from '@/types/agent';
import { validateSSEEvent, type ValidatedAgentSSEEvent } from '@/lib/schema';


export interface StreamHandlers {
  onEvent: (event: ValidatedAgentSSEEvent) => void;
  onError: (message: string) => void;
}

/**
 * React hook for streaming agent responses via SSE.
 * Returns `run` to start a stream and `cancel` to abort it.
 * Manages an internal AbortController ref for cancellation.
 */

/** Determine whether a failed stream attempt should be retried. */
function shouldRetry(
  lastEvent: ValidatedAgentSSEEvent | null,
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

export interface ParsedSSEResult {
  events: string[];
  remainder: string;
}

export function parseSSEBuffer(buffer: string): ParsedSSEResult {
  const parts = buffer.split(/\r?\n\r?\n/);
  if (parts.length <= 1) {
    return { events: [], remainder: buffer };
  }

  const remainder = parts.pop() ?? '';
  const events: string[] = [];
  for (const chunk of parts) {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'));
    for (const line of lines) {
      const json = line.slice(5).trim();
      if (json) events.push(json);
    }
  }
  return { events, remainder };
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
  const mountedRef = useRef(true);
  const handlersRef = useRef<StreamHandlers | null>(null);
  const onRetryRef = useRef<((attempt: number, delayMs: number, reason: string) => void) | undefined>(undefined);
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
      handlersRef.current = args.handlers;
      onRetryRef.current = args.onRetry;
      const gen = ++generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      const maxRetries = args.maxRetries ?? 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (!mountedRef.current) return;
        let lastEvent: ValidatedAgentSSEEvent | null = null;
        let httpStatus: number | null = null;
        let caughtError: unknown = null;

        try {
          const res = await fetch('/api/agent/stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              'X-Session-Id': args.sessionId,
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
            const decision = shouldRetry(null, httpStatus, null);
            if (decision.retry && attempt < maxRetries) {
              const delayMs = computeDelay(attempt, decision.reason);
              onRetryRef.current?.(attempt + 1, delayMs, decision.reason);
              await retrySleep(delayMs, controller.signal);
              continue;
            }
            if (mountedRef.current) {
              handlersRef.current?.onError(`Stream request failed with status ${res.status}`);
            }
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
                  const event = validateSSEEvent(parsed);
                  if (!event) {
                    consecutiveFailures++;
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                      if (mountedRef.current && gen === generationRef.current) {
                        handlersRef.current?.onError('Stream corrupted — too many malformed events');
                      }
                      return;
                    }
                    continue;
                  }
                  consecutiveFailures = 0;
                  lastEvent = event;
                  if (mountedRef.current && gen === generationRef.current) {
                    handlersRef.current?.onEvent(event);
                  }
                } catch {
                  consecutiveFailures++;
                  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    if (mountedRef.current && gen === generationRef.current) {
                      handlersRef.current?.onError('Stream corrupted — too many malformed events');
                    }
                    return;
                  }
                  if (mountedRef.current && gen === generationRef.current) {
                    handlersRef.current?.onError('Invalid SSE JSON payload received');
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
                const event = validateSSEEvent(parsed);
                if (event) {
                  lastEvent = event;
                  if (mountedRef.current && gen === generationRef.current) {
                    handlersRef.current?.onEvent(event);
                  }
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
            onRetryRef.current?.(attempt + 1, delayMs, decision.reason);
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
            onRetryRef.current?.(attempt + 1, delayMs, decision.reason);
            try {
              await retrySleep(delayMs, controller.signal);
            } catch {
              return; // abort during sleep
            }
            continue;
          }
          if (mountedRef.current && gen === generationRef.current) {
            handlersRef.current?.onError(caughtError instanceof Error ? caughtError.message : 'Stream aborted unexpectedly');
          }
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
