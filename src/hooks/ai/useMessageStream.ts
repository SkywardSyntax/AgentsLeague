/**
 * React hook for streaming text messages from /api/chat.
 *
 * Streams SSE events, accumulates text chunks, extracts reasoning blocks,
 * and parses JSON code blocks for syntax highlighting.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import type { Message, ReasoningData } from '@/types/interaction';
import { InteractionMode, MessageRole } from '@/types/interaction';
import { deduplicatedFetch } from '@/utils/api-client';

// ── Types ───────────────────────────────────────────────────────

export interface CodeBlock {
  readonly language: string;
  readonly code: string;
}

export interface ParsedContent {
  readonly text: string;
  readonly reasoning: ReasoningData | null;
  readonly codeBlocks: readonly CodeBlock[];
}

export interface UseMessageStreamOptions {
  endpoint?: string;
  onToken?: (token: string) => void;
  onError?: (error: Error) => void;
  onComplete?: (message: Message) => void;
}

// ── Reasoning extraction ────────────────────────────────────────

const REASONING_START = '[REASONING_START]';
const REASONING_END = '[REASONING_END]';

function extractReasoning(text: string): { cleaned: string; reasoning: ReasoningData | null } {
  const steps: string[] = [];
  let cleaned = text;
  let match: RegExpExecArray | null;
  const re = /\[REASONING_START\]([\s\S]*?)\[REASONING_END\]/g;

  while ((match = re.exec(text)) !== null) {
    const content = match[1]?.trim() ?? '';
    if (content) {
      steps.push(...content.split('\n').filter((l) => l.trim()));
    }
  }

  cleaned = cleaned.replace(re, '').trim();

  if (steps.length === 0) return { cleaned, reasoning: null };
  return {
    cleaned,
    reasoning: { steps, confidence: 1 },
  };
}

// ── Code block parsing ──────────────────────────────────────────

function parseCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const language = match[1] || 'text';
    const code = match[2]?.trim() ?? '';
    if (code) blocks.push({ language, code });
  }

  return blocks;
}

// ── Parse accumulated content ───────────────────────────────────

export function parseStreamContent(raw: string): ParsedContent {
  const { cleaned, reasoning } = extractReasoning(raw);
  const codeBlocks = parseCodeBlocks(cleaned);
  return { text: cleaned, reasoning, codeBlocks };
}

// ── SSE event types from /api/chat ──────────────────────────────

interface MessageEvent {
  type: 'message';
  data: string;
}

interface DoneEvent {
  type: 'done';
}

interface ErrorSSEEvent {
  type: 'error';
  code: string;
  message: string;
}

type ChatSSEEvent = MessageEvent | DoneEvent | ErrorSSEEvent;

// ── Hook ────────────────────────────────────────────────────────

export function useMessageStream(options: UseMessageStreamOptions = {}) {
  const { endpoint = '/api/chat', onToken, onError, onComplete } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const accumulatorRef = useRef('');

  /**
   * Stream a text message from the chat endpoint.
   * Yields text chunks as they arrive from SSE.
   */
  const streamTextMessage = useCallback(
    async function* (
      userMessage: string,
      conversationHistory: Message[] = []
    ): AsyncGenerator<string> {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      accumulatorRef.current = '';
      setError(null);
      setIsStreaming(true);

      try {
        const response = await deduplicatedFetch('chat-stream', endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMessage,
            conversationHistory: conversationHistory.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Chat stream failed: ${response.status}`);
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
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;

            try {
              const event = JSON.parse(raw) as ChatSSEEvent;

              switch (event.type) {
                case 'message':
                  accumulatorRef.current += event.data;
                  onToken?.(event.data);
                  yield event.data;
                  break;

                case 'error': {
                  const err = new Error(event.message);
                  setError(err);
                  onError?.(err);
                  return;
                }

                case 'done':
                  break;
              }
            } catch {
              // Skip malformed SSE frames
            }
          }
        }

        // Process remaining buffer
        if (buffer.startsWith('data: ')) {
          const raw = buffer.slice(6).trim();
          if (raw && raw !== '[DONE]') {
            try {
              const event = JSON.parse(raw) as ChatSSEEvent;
              if (event.type === 'message') {
                accumulatorRef.current += event.data;
                onToken?.(event.data);
                yield event.data;
              }
            } catch {
              // skip
            }
          }
        }

        // Build completed message
        const parsed = parseStreamContent(accumulatorRef.current);
        const completedMessage: Message = {
          id: crypto.randomUUID(),
          role: MessageRole.ASSISTANT,
          content: parsed.text,
          timestamp: Date.now(),
          source: InteractionMode.TEXT,
          reasoning: parsed.reasoning,
          meta: { streamComplete: true },
        };
        onComplete?.(completedMessage);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);
      } finally {
        setIsStreaming(false);
      }
    },
    [endpoint, onToken, onError, onComplete]
  );

  /**
   * Convenience wrapper that consumes the async generator,
   * accumulates all chunks, and returns the parsed result.
   */
  const streamText = useCallback(
    async (
      userMessage: string,
      conversationHistory: Message[] = []
    ): Promise<ParsedContent | null> => {
      const gen = streamTextMessage(userMessage, conversationHistory);
      // Consume the generator to drive the stream
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of gen) {
        // chunks are accumulated internally and emitted via onToken
      }

      if (!accumulatorRef.current) return null;
      return parseStreamContent(accumulatorRef.current);
    },
    [streamTextMessage]
  );

  /** Cancel any in-flight stream. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return {
    streamTextMessage,
    streamText,
    isStreaming,
    error,
    cancel,
  } as const;
}
