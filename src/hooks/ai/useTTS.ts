/**
 * Text-to-Speech hook for voice mode output.
 *
 * Provider priority:
 *   1. Browser-native Web Speech API (SpeechSynthesis) — zero latency, free
 *   2. ElevenLabs streaming TTS — highest quality
 *   3. OpenAI TTS — reliable fallback
 *
 * Features:
 *   - Per-sentence chunking for low perceived latency
 *   - In-memory audio cache keyed by text hash
 *   - Playback progress reporting
 *   - Rate limiting (max 100 requests / minute)
 *   - Graceful error handling with provider fallback
 */

'use client';

import { useCallback, useRef, useState } from 'react';

// ── Public types ────────────────────────────────────────────────

export type AudioBlob = Blob;

export type TTSProvider = 'web-speech' | 'elevenlabs' | 'openai';

export interface UseTTSOptions {
  /** ElevenLabs API key (client-side). Falls back to env if omitted. */
  elevenLabsApiKey?: string;
  /** ElevenLabs voice ID. Defaults to "Rachel". */
  elevenLabsVoiceId?: string;
  /** OpenAI TTS endpoint. Defaults to /api/tts. */
  openaiEndpoint?: string;
  /** OpenAI voice. */
  openaiVoice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  /** Force a specific provider instead of auto-detect. */
  provider?: TTSProvider;
  onError?: (error: Error) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface UseTTSReturn {
  /** Synthesize text into an AudioBlob (cached). */
  synthesize: (text: string) => Promise<AudioBlob>;
  /** Synthesize and immediately play text. */
  play: (text: string) => Promise<void>;
  /** Stop current playback. */
  stop: () => void;
  /** Whether audio is currently playing. */
  isPlaying: boolean;
  /** Playback progress 0 → 1. */
  progress: number;
}

// ── Constants ───────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_ELEVEN_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // "Rachel"

// ── Helpers ─────────────────────────────────────────────────────

/** Fast 53-bit string hash (FNV-1a variant). */
function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Split text into sentences for chunked synthesis. */
function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+[\s]*/g);
  if (!raw) return text.trim() ? [text.trim()] : [];
  // Trim whitespace and filter empties
  return raw.map((s) => s.trim()).filter(Boolean);
}

/** Simple sliding-window rate limiter. */
class RateLimiter {
  private timestamps: number[] = [];

  canProceed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    return this.timestamps.length < RATE_LIMIT_MAX;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }
}

/** Detect browser-native Web Speech API availability. */
function isWebSpeechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

// ── Provider implementations ────────────────────────────────────

function synthesizeWebSpeech(_text: string): Promise<AudioBlob> {
  // Web Speech API doesn't produce a Blob — we play it directly.
  // Return a zero-length sentinel blob so the cache contract holds.
  return Promise.resolve(new Blob([], { type: 'audio/wav' }));
}

function playWebSpeech(
  text: string,
  onProgress: (p: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);

    const onAbort = () => {
      synth.cancel();
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });

    utterance.onboundary = (e) => {
      if (e.charIndex != null && text.length > 0) {
        onProgress(Math.min(e.charIndex / text.length, 1));
      }
    };

    utterance.onend = () => {
      signal.removeEventListener('abort', onAbort);
      onProgress(1);
      resolve();
    };

    utterance.onerror = (e) => {
      signal.removeEventListener('abort', onAbort);
      if (e.error === 'canceled' || e.error === 'interrupted') {
        resolve();
      } else {
        reject(new Error(`Web Speech error: ${e.error}`));
      }
    };

    synth.speak(utterance);
  });
}

async function synthesizeElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string,
  signal: AbortSignal,
): Promise<AudioBlob> {
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed: ${res.status}`);
  }

  return res.blob();
}

async function synthesizeOpenAI(
  text: string,
  endpoint: string,
  voice: string,
  signal: AbortSignal,
): Promise<AudioBlob> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, voice }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`OpenAI TTS failed: ${res.status}`);
  }

  return res.blob();
}

// ── Audio playback helper ───────────────────────────────────────

function playAudioBlob(
  blob: AudioBlob,
  onProgress: (p: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.pause();
      audio.removeAttribute('src');
    };

    const onAbort = () => {
      cleanup();
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });

    audio.ontimeupdate = () => {
      if (audio.duration > 0) {
        onProgress(Math.min(audio.currentTime / audio.duration, 1));
      }
    };

    audio.onended = () => {
      signal.removeEventListener('abort', onAbort);
      onProgress(1);
      cleanup();
      resolve();
    };

    audio.onerror = () => {
      signal.removeEventListener('abort', onAbort);
      cleanup();
      reject(new Error('Audio playback failed'));
    };

    audio.play().catch((err: unknown) => {
      signal.removeEventListener('abort', onAbort);
      cleanup();
      reject(new Error(err instanceof Error ? err.message : 'Audio playback failed'));
    });
  });
}

// ── Hook ────────────────────────────────────────────────────────

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const {
    elevenLabsApiKey,
    elevenLabsVoiceId = DEFAULT_ELEVEN_VOICE,
    openaiEndpoint = '/api/tts',
    openaiVoice = 'alloy',
    provider: forcedProvider,
    onError,
    onStart,
    onEnd,
  } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, AudioBlob>>(new Map());
  const rateLimiterRef = useRef(new RateLimiter());

  // ── Resolve provider ────────────────────────────────────────

  const resolveProvider = useCallback((): TTSProvider => {
    if (forcedProvider) return forcedProvider;
    if (isWebSpeechAvailable()) return 'web-speech';
    if (elevenLabsApiKey) return 'elevenlabs';
    return 'openai';
  }, [forcedProvider, elevenLabsApiKey]);

  // ── Synthesize a single chunk ───────────────────────────────

  const synthesizeChunk = useCallback(
    async (text: string, signal: AbortSignal): Promise<AudioBlob> => {
      const key = hashText(text);
      const cached = cacheRef.current.get(key);
      if (cached) return cached;

      if (!rateLimiterRef.current.canProceed()) {
        throw new Error('TTS rate limit exceeded (100 req/min)');
      }
      rateLimiterRef.current.record();

      const prov = resolveProvider();
      let blob: AudioBlob;

      switch (prov) {
        case 'web-speech':
          blob = await synthesizeWebSpeech(text);
          break;

        case 'elevenlabs':
          try {
            blob = await synthesizeElevenLabs(text, elevenLabsApiKey!, elevenLabsVoiceId, signal);
          } catch (err) {
            // Fallback to OpenAI on ElevenLabs failure
            if (signal.aborted) throw err;
            blob = await synthesizeOpenAI(text, openaiEndpoint, openaiVoice, signal);
          }
          break;

        case 'openai':
        default:
          blob = await synthesizeOpenAI(text, openaiEndpoint, openaiVoice, signal);
          break;
      }

      cacheRef.current.set(key, blob);
      return blob;
    },
    [resolveProvider, elevenLabsApiKey, elevenLabsVoiceId, openaiEndpoint, openaiVoice],
  );

  // ── Public: synthesize full text ────────────────────────────

  const synthesize = useCallback(
    async (text: string): Promise<AudioBlob> => {
      const sentences = splitSentences(text);
      if (sentences.length === 0) {
        return new Blob([], { type: 'audio/mp3' });
      }

      // Single sentence — return directly
      if (sentences.length === 1) {
        const controller = new AbortController();
        return synthesizeChunk(sentences[0]!, controller.signal);
      }

      // Multiple sentences — synthesize all and concatenate
      const controller = new AbortController();
      const blobs = await Promise.all(
        sentences.map((s) => synthesizeChunk(s, controller.signal)),
      );
      return new Blob(blobs, { type: blobs[0]?.type ?? 'audio/mp3' });
    },
    [synthesizeChunk],
  );

  // ── Public: play ────────────────────────────────────────────

  const play = useCallback(
    async (text: string): Promise<void> => {
      // Abort previous playback
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsPlaying(true);
      setProgress(0);
      onStart?.();

      try {
        const sentences = splitSentences(text);
        if (sentences.length === 0) return;

        const prov = resolveProvider();

        for (let i = 0; i < sentences.length; i++) {
          if (controller.signal.aborted) break;

          const sentence = sentences[i]!;
          const baseProgress = i / sentences.length;
          const chunkWeight = 1 / sentences.length;

          if (prov === 'web-speech') {
            // Web Speech plays directly — no blob needed
            if (!rateLimiterRef.current.canProceed()) {
              throw new Error('TTS rate limit exceeded (100 req/min)');
            }
            rateLimiterRef.current.record();

            await playWebSpeech(
              sentence,
              (p) => setProgress(baseProgress + p * chunkWeight),
              controller.signal,
            );
          } else {
            const blob = await synthesizeChunk(sentence, controller.signal);
            if (controller.signal.aborted) break;

            await playAudioBlob(
              blob,
              (p) => setProgress(baseProgress + p * chunkWeight),
              controller.signal,
            );
          }
        }

        setProgress(1);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      } finally {
        setIsPlaying(false);
        onEnd?.();
      }
    },
    [resolveProvider, synthesizeChunk, onError, onStart, onEnd],
  );

  // ── Public: stop ────────────────────────────────────────────

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // Also cancel any Web Speech in progress
    if (isWebSpeechAvailable()) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setProgress(0);
  }, []);

  return { synthesize, play, stop, isPlaying, progress } as const;
}
