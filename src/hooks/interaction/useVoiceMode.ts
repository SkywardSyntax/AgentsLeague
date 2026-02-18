'use client';

import { useCallback, useRef, useState } from 'react';
import {
  InteractionMode,
  MessageRole,
  VoiceState,
  voiceTransition,
  type VoiceSession,
  type VoiceEvent,
} from '@/types/interaction';
import { useConversationStore } from '@/stores/conversation-store';

/**
 * Voice state machine diagram (see src/types/interaction.ts for full ASCII art):
 *
 * IDLE → LISTENING   : user presses mic
 * LISTENING → TRANSCRIBING : speech ends / silence detected
 * TRANSCRIBING → SENDING   : transcript finalized, send to LLM
 * SENDING → STREAMING      : LLM starts responding
 * STREAMING → DRAWING      : LLM emits tool/draw calls
 * DRAWING → SPEAKING       : optional TTS
 * SPEAKING → IDLE           : playback complete
 * Any state → IDLE          : user cancels
 */

// ── Web Speech API type augmentation ────────────────────────────

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null;
}

// ── Hook Options ────────────────────────────────────────────────

export interface UseVoiceModeOptions {
  lang?: string;
  onTranscript?: (text: string, confidence: number) => void;
  onError?: (error: string) => void;
}

// ── Initial Session State ───────────────────────────────────────

const INITIAL_SESSION: VoiceSession = {
  state: VoiceState.IDLE,
  interimTranscript: '',
  finalTranscript: '',
  confidence: 0,
  error: null,
};

/**
 * Hook for voice interaction mode.
 *
 * Uses Web Speech API for speech-to-text with real-time
 * interim results and confidence scores.
 * Falls back to Whisper API stub if browser doesn't support Web Speech.
 *
 * @example
 * ```tsx
 * const { session, startListening, stopListening, isSupported } = useVoiceMode();
 *
 * return (
 *   <button
 *     onMouseDown={startListening}
 *     onMouseUp={stopListening}
 *     disabled={!isSupported}
 *   >
 *     {session.state === VoiceState.LISTENING ? '🔴 Listening...' : '🎤'}
 *   </button>
 * );
 * ```
 */
export function useVoiceMode(options: UseVoiceModeOptions = {}) {
  const { lang = 'en-US', onTranscript, onError } = options;

  const [session, setSession] = useState<VoiceSession>(INITIAL_SESSION);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const addMessage = useConversationStore((s) => s.addMessage);
  const setProcessing = useConversationStore((s) => s.setProcessing);

  const isSupported = typeof window !== 'undefined' && getSpeechRecognition() !== null;

  // Dispatch a voice event through the state machine
  const dispatch = useCallback((event: VoiceEvent) => {
    setSession((prev) => voiceTransition(prev, event));
  }, []);

  const startListening = useCallback(() => {
    const SR = getSpeechRecognition();

    if (!SR) {
      // Fallback: Whisper API stub
      onError?.('Web Speech API not supported. Whisper fallback not yet implemented.');
      dispatch({ type: 'ERROR', message: 'Speech recognition not supported in this browser' });
      return;
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      let confidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.[0]) continue;

        if (result.isFinal) {
          final += result[0].transcript;
          confidence = result[0].confidence;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        dispatch({ type: 'INTERIM_RESULT', transcript: interim });
      }

      if (final) {
        dispatch({ type: 'FINAL_RESULT', transcript: final, confidence });
        onTranscript?.(final, confidence);

        // Auto-send: add as user message
        addMessage(final, MessageRole.USER, {
          source: InteractionMode.VOICE,
          meta: { voiceTranscriptConfidence: confidence },
        });

        dispatch({ type: 'SEND' });
        setProcessing(true);
      }
    };

    recognition.onerror = (event: Event & { error: string }) => {
      dispatch({ type: 'ERROR', message: event.error });
      onError?.(event.error);
    };

    recognition.onend = () => {
      // If we never got a final result, move to idle
      setSession((prev) => {
        if (prev.state === VoiceState.LISTENING) {
          return voiceTransition(prev, { type: 'CANCEL' });
        }
        return prev;
      });
    };

    recognitionRef.current = recognition;
    dispatch({ type: 'START_LISTENING' });
    recognition.start();
  }, [lang, dispatch, addMessage, setProcessing, onTranscript, onError]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    dispatch({ type: 'CANCEL' });
    setProcessing(false);
  }, [dispatch, setProcessing]);

  // Notify the voice state machine of external events (used by orchestrators)
  const notifyStreamStart = useCallback(() => dispatch({ type: 'STREAM_START' }), [dispatch]);
  const notifyStreamComplete = useCallback(() => dispatch({ type: 'STREAM_COMPLETE' }), [dispatch]);
  const notifyDrawStart = useCallback(() => dispatch({ type: 'DRAW_START' }), [dispatch]);
  const notifyDrawComplete = useCallback(() => dispatch({ type: 'DRAW_COMPLETE' }), [dispatch]);
  const notifySpeakStart = useCallback(() => dispatch({ type: 'SPEAK_START' }), [dispatch]);
  const notifySpeakComplete = useCallback(() => dispatch({ type: 'SPEAK_COMPLETE' }), [dispatch]);

  return {
    session,
    isSupported,
    startListening,
    stopListening,
    cancel,
    notifyStreamStart,
    notifyStreamComplete,
    notifyDrawStart,
    notifyDrawComplete,
    notifySpeakStart,
    notifySpeakComplete,
  } as const;
}

// ── Whisper Fallback Stub ───────────────────────────────────────

/**
 * Stub for Whisper API fallback.
 * TODO: Implement actual Whisper transcription via /api/transcribe
 */
export async function whisperTranscribe(
  _audioBlob: Blob,
): Promise<{ text: string; confidence: number }> {
  throw new Error('Whisper fallback not yet implemented');
}
