'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  InteractionMode,
  MessageRole,
  type DrawingCommand,
  type ReasoningData,
} from '@/types/interaction';
import { useConversationStore } from '@/stores/conversation-store';

const DRAW_START = '[DRAW_START]';
const DRAW_END = '[DRAW_END]';
const REASONING_START = '[REASONING_START]';
const REASONING_END = '[REASONING_END]';

export interface UseTextModeOptions {
  endpoint?: string;
  onDrawingCommand?: (cmd: DrawingCommand) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for text interaction mode.
 * Handles submitting text, streaming LLM responses,
 * and extracting drawing commands + reasoning.
 */
export function useTextMode(options: UseTextModeOptions = {}) {
  const { endpoint = '/api/draw', onDrawingCommand, onError } = options;

  const addMessage = useConversationStore((s) => s.addMessage);
  const updateMessage = useConversationStore((s) => s.updateMessage);
  const setProcessing = useConversationStore((s) => s.setProcessing);
  const messages = useConversationStore((s) => s.messages);
  const messagesRef = useRef(messages);

  // Keep ref updated with latest messages without affecting dependency array
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [streamedText, setStreamedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmitText = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      // Add user message
      addMessage(message.trim(), MessageRole.USER, {
        source: InteractionMode.TEXT,
      });

      setProcessing(true);
      setIsStreaming(true);
      setStreamedText('');

      // Create placeholder assistant message
      const assistantMsg = addMessage('', MessageRole.ASSISTANT, {
        source: InteractionMode.TEXT,
        meta: { streamComplete: false },
      });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMessage: message.trim(),
            conversationHistory: messagesRef.current.map((m) => ({
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
        let fullText = '';

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
              const parsed = JSON.parse(data) as { text?: string };
              if (parsed.text) {
                fullText += parsed.text;
                setStreamedText(fullText);
                updateMessage(assistantMsg.id, { content: fullText });
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }

        // Extract drawing commands and reasoning from full text
        const drawing = extractDrawingCommand(fullText);
        const reasoning = extractReasoning(fullText);
        const cleanText = stripDelimiters(fullText);

        updateMessage(assistantMsg.id, {
          content: cleanText,
          drawing,
          reasoning,
          meta: { streamComplete: true },
        });

        if (drawing) {
          onDrawingCommand?.(drawing);
        }

        if (reasoning) {
          addMessage(reasoning.steps.join('\n'), MessageRole.REASONING, {
            source: InteractionMode.TEXT,
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        updateMessage(assistantMsg.id, {
          content: `Error: ${error.message}`,
          meta: { streamComplete: true },
        });
      } finally {
        setIsStreaming(false);
        setProcessing(false);
      }
    },
    [endpoint, addMessage, updateMessage, setProcessing, onDrawingCommand, onError],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setProcessing(false);
  }, [setProcessing]);

  return { handleSubmitText, stopStream, streamedText, isStreaming } as const;
}

// ── Parsing Helpers ─────────────────────────────────────────────

function extractDrawingCommand(text: string): DrawingCommand | null {
  const startIdx = text.indexOf(DRAW_START);
  const endIdx = text.indexOf(DRAW_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

  const jsonStr = text.slice(startIdx + DRAW_START.length, endIdx).trim();
  try {
    return JSON.parse(jsonStr) as DrawingCommand;
  } catch {
    return null;
  }
}

function extractReasoning(text: string): ReasoningData | null {
  const startIdx = text.indexOf(REASONING_START);
  const endIdx = text.indexOf(REASONING_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

  const jsonStr = text.slice(startIdx + REASONING_START.length, endIdx).trim();
  try {
    return JSON.parse(jsonStr) as ReasoningData;
  } catch {
    return null;
  }
}

function stripDelimiters(text: string): string {
  return text
    .replace(/\[DRAW_START\][\s\S]*?\[DRAW_END\]/g, '')
    .replace(/\[REASONING_START\][\s\S]*?\[REASONING_END\]/g, '')
    .trim();
}
