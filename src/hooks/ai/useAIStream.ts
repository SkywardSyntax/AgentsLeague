'use client';

import { useCallback, useRef, useState } from 'react';
import type { DrawOp } from '@/types';

export interface UseAIStreamOptions {
  endpoint?: string;
  onOp?: (op: DrawOp) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export function useAIStream(options: UseAIStreamOptions = {}) {
  const { endpoint = '/api/draw', onOp, onError, onComplete } = options;
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (prompt: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
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
              onOp?.(op);
            } catch {
              // Skip malformed chunks
            }
          }
        }

        onComplete?.();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsStreaming(false);
      }
    },
    [endpoint, onOp, onError, onComplete],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { start, stop, isStreaming } as const;
}
