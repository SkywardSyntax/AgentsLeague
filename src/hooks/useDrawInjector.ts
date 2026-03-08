'use client';

import { useCallback, useRef, useState } from 'react';
import type { DrawBatch } from '@/types/agent';
import { DrawBatchSchema } from '@/lib/schema';

export interface InjectDiagnostics {
  violationsFixed: string[];
  fallbackUsed: boolean;
  elementCount: number;
}

export interface InjectResult {
  ok: true;
  batch: DrawBatch;
  diagnostics: InjectDiagnostics;
}

export interface InjectError {
  ok: false;
  error: string;
  message: string;
  issues?: Array<{ path: (string | number)[]; message: string }>;
}

export type InjectResponse = InjectResult | InjectError;

export function useDrawInjector(sessionId?: string) {
  const [isInjecting, setIsInjecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<InjectResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const inject = useCallback(async (batch: DrawBatch): Promise<InjectResult | null> => {
    // Validate client-side first
    const parsed = DrawBatchSchema.safeParse(batch);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      setError(`Validation failed: ${msg}`);
      return null;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsInjecting(true);
    setError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionIdRef.current) {
        headers['X-Session-Id'] = sessionIdRef.current;
      }

      const res = await fetch('/api/whiteboard/inject', {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
        signal: controller.signal,
      });

      const data = (await res.json()) as InjectResponse;

      if (!res.ok || !data.ok) {
        const errData = data as InjectError;
        const msg = errData.message ?? `Injection failed (${res.status})`;
        setError(msg);
        return null;
      }

      const result = data as InjectResult;
      setLastResult(result);
      return result;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      const msg = err instanceof Error ? err.message : 'Unknown injection error';
      setError(msg);
      return null;
    } finally {
      setIsInjecting(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { inject, isInjecting, error, lastResult, clearError } as const;
}
