/**
 * React hook for Whisper API voice transcription.
 *
 * Provides `transcribeAudio` to send audio blobs to OpenAI's
 * Whisper endpoint with caching, format validation, and error handling.
 */

'use client';

import { useCallback, useRef, useState } from 'react';

// ── Constants ───────────────────────────────────────────────────────

const WHISPER_ENDPOINT = '/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

const SUPPORTED_FORMATS = new Set([
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/mpga',
  'audio/m4a',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/webm',
]);

const FORMAT_EXTENSIONS: Record<string, string> = {
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mpeg',
  'audio/mpga': 'mpga',
  'audio/m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

// ── Types ───────────────────────────────────────────────────────────

export interface UseWhisperOptions {
  apiKey?: string;
  baseUrl?: string;
  language?: string;
  onTranscript?: (text: string) => void;
  onError?: (error: Error) => void;
}

export interface WhisperError extends Error {
  status?: number;
  retryable: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

function createWhisperError(
  message: string,
  status?: number,
  retryable = false,
): WhisperError {
  const err = new Error(message) as WhisperError;
  err.name = 'WhisperError';
  if (status !== undefined) err.status = status;
  err.retryable = retryable;
  return err;
}

/** Generate a hex hash of an ArrayBuffer using SubtleCrypto (SHA-256). */
async function hashAudioBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isSupportedFormat(mimeType: string): boolean {
  return SUPPORTED_FORMATS.has(mimeType);
}

function filenameForBlob(blob: Blob): string {
  const ext = FORMAT_EXTENSIONS[blob.type] ?? 'webm';
  return `audio.${ext}`;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useWhisper(options: UseWhisperOptions = {}) {
  const {
    apiKey,
    baseUrl = 'https://api.openai.com',
    language,
    onTranscript,
    onError,
  } = options;

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  /**
   * Transcribe an audio blob via the OpenAI Whisper API.
   * Returns the transcript text. Results are cached by content hash.
   */
  const transcribeAudio = useCallback(
    async (audioBlob: Blob, overrideLanguage?: string): Promise<string> => {
      const resolvedKey = apiKey ?? process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      if (!resolvedKey) {
        const err = createWhisperError('Missing OPENAI_API_KEY for Whisper transcription');
        onError?.(err);
        throw err;
      }

      // Validate format
      if (audioBlob.type && !isSupportedFormat(audioBlob.type)) {
        const err = createWhisperError(
          `Unsupported audio format: ${audioBlob.type}. Supported: MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM`,
        );
        onError?.(err);
        throw err;
      }

      // Check cache
      const hash = await hashAudioBlob(audioBlob);
      const lang = overrideLanguage ?? language;
      const cacheKey = lang ? `${hash}:${lang}` : hash;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setTranscript(cached);
        onTranscript?.(cached);
        return cached;
      }

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsTranscribing(true);

      try {
        const formData = new FormData();
        formData.append('file', audioBlob, filenameForBlob(audioBlob));
        formData.append('model', WHISPER_MODEL);
        if (lang) {
          formData.append('language', lang);
        }

        const response = await fetch(`${baseUrl}${WHISPER_ENDPOINT}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resolvedKey}`,
          },
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          const status = response.status;
          const body = await response.text().catch(() => '');

          if (status === 429) {
            throw createWhisperError(
              'Whisper API rate limit exceeded. Please try again later.',
              status,
              true,
            );
          }
          if (status >= 500) {
            throw createWhisperError(
              `Whisper API server error (${status}): ${body}`,
              status,
              true,
            );
          }
          throw createWhisperError(
            `Whisper API request failed (${status}): ${body}`,
            status,
          );
        }

        const data = (await response.json()) as { text: string };
        const text = data.text?.trim() ?? '';

        // Cache the result
        cacheRef.current.set(cacheKey, text);

        setTranscript(text);
        onTranscript?.(text);
        return text;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw createWhisperError('Transcription aborted');
        }

        const error =
          (err as WhisperError).name === 'WhisperError'
            ? (err as WhisperError)
            : createWhisperError(
                err instanceof Error ? err.message : String(err),
              );
        onError?.(error);
        throw error;
      } finally {
        setIsTranscribing(false);
      }
    },
    [apiKey, baseUrl, language, onTranscript, onError],
  );

  /** Cancel any in-flight transcription request. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Clear the transcript cache. */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    transcribeAudio,
    cancel,
    clearCache,
    isTranscribing,
    transcript,
  } as const;
}
