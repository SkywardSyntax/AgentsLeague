'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceState } from '@/types/interaction';
import { useVoiceMode } from '@/hooks/interaction/useVoiceMode';

// ── Waveform Visualizer ─────────────────────────────────────────

const BAR_COUNT = 24;
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = 28;

interface WaveformProps {
  active: boolean;
  level: number; // 0-1 normalized audio level
}

function Waveform({ active, level }: WaveformProps) {
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => MIN_BAR_HEIGHT),
  );
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to idle state
      setBars(Array.from({ length: BAR_COUNT }, () => MIN_BAR_HEIGHT));
      return;
    }

    let animating = true;
    let lastTime = 0;
    const FRAME_INTERVAL = 33; // ~30fps throttle to reduce React re-renders
    const animate = (time: number) => {
      if (!animating) return;
      if (time - lastTime >= FRAME_INTERVAL) {
        lastTime = time;
        setBars((prev) =>
          prev.map((_, i) => {
            const center = BAR_COUNT / 2;
            const dist = Math.abs(i - center) / center;
            const envelope = 1 - dist * 0.5;
            const noise = 0.3 + Math.random() * 0.7;
            const h = MIN_BAR_HEIGHT + (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) * level * envelope * noise;
            return Math.round(Math.min(h, MAX_BAR_HEIGHT));
          }),
        );
      }
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      animating = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [active, level]);

  return (
    <div
      className="flex items-center justify-center gap-[2px]"
      role="img"
      aria-label={active ? 'Audio waveform visualizer active' : 'Audio waveform visualizer idle'}
    >
      {bars.map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full transition-[height] duration-instant ${
            active
              ? 'bg-accent'
              : 'bg-border'
          }`}
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  );
}

// ── State Label Helpers ─────────────────────────────────────────

function getStateLabel(state: VoiceState): string {
  switch (state) {
    case VoiceState.LISTENING:
      return 'Listening...';
    case VoiceState.TRANSCRIBING:
      return 'Processing...';
    case VoiceState.SENDING:
      return 'Sending...';
    case VoiceState.STREAMING:
      return 'Receiving response...';
    case VoiceState.DRAWING:
      return 'Drawing...';
    case VoiceState.SPEAKING:
      return 'Speaking...';
    case VoiceState.COMPLETE:
      return 'Complete';
    default:
      return 'Ready';
  }
}

function isActiveState(state: VoiceState): boolean {
  return state !== VoiceState.IDLE && state !== VoiceState.COMPLETE;
}

function isProcessingState(state: VoiceState): boolean {
  return (
    state === VoiceState.TRANSCRIBING ||
    state === VoiceState.SENDING ||
    state === VoiceState.STREAMING ||
    state === VoiceState.DRAWING ||
    state === VoiceState.SPEAKING
  );
}

// ── Confidence Display ──────────────────────────────────────────

function ConfidenceScore({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color =
    percent >= 80
      ? 'text-success'
      : percent >= 50
        ? 'text-warning'
        : 'text-error';

  return (
    <span className={`text-xs font-mono ${color}`} aria-label={`Confidence ${percent} percent`}>
      {percent}%
    </span>
  );
}

// ── Mic Button ──────────────────────────────────────────────────

interface MicButtonProps {
  state: VoiceState;
  isSupported: boolean;
  onStart: () => void;
  onStop: () => void;
}

function MicButton({ state, isSupported, onStart, onStop }: MicButtonProps) {
  const isListening = state === VoiceState.LISTENING;
  const isActive = isActiveState(state);
  const isProcessing = isProcessingState(state);

  const handleClick = useCallback(() => {
    if (isListening) {
      onStop();
    } else if (!isActive) {
      onStart();
    }
  }, [isListening, isActive, onStart, onStop]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isSupported || isProcessing}
      className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-normal ${
        isListening
          ? 'bg-error text-content-inverse shadow-md'
          : isProcessing
            ? 'bg-surface-raised text-content-tertiary cursor-not-allowed'
            : 'bg-accent text-content-inverse shadow-sm hover:bg-accent-hover hover:shadow-md active:scale-95'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      aria-label={
        isListening
          ? 'Stop listening'
          : isProcessing
            ? 'Processing voice input'
            : 'Start voice input'
      }
      aria-pressed={isListening}
    >
      {/* Pulse ring for listening state */}
      {isListening && (
        <span className="absolute inset-0 animate-pulse rounded-full bg-error/20" aria-hidden="true" />
      )}

      {/* Mic icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        {isProcessing ? (
          // Spinner-like dots for processing
          <>
            <circle cx="12" cy="6" r="1.5" fill="currentColor" className="animate-ai-thinking" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" className="animate-ai-thinking [animation-delay:200ms]" />
            <circle cx="12" cy="18" r="1.5" fill="currentColor" className="animate-ai-thinking [animation-delay:400ms]" />
          </>
        ) : (
          // Microphone icon
          <>
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </>
        )}
      </svg>
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────

export interface VoiceIndicatorProps {
  /** Override audio level for waveform (0-1). If not provided, simulated from state. */
  audioLevel?: number;
  /** Additional CSS class names. */
  className?: string;
}

export default function VoiceIndicator({ audioLevel, className = '' }: VoiceIndicatorProps) {
  const {
    session,
    isSupported,
    startListening,
    stopListening,
    cancel,
  } = useVoiceMode();

  const { state, interimTranscript, finalTranscript, confidence, error } = session;

  // Simulate audio level from state when no real level is provided
  const [simulatedLevel, setSimulatedLevel] = useState(0);
  useEffect(() => {
    if (audioLevel !== undefined || state !== VoiceState.LISTENING) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset simulated level
      setSimulatedLevel(0);
      return;
    }
    let animating = true;
    const tick = () => {
      if (!animating) return;
      setSimulatedLevel(0.3 + Math.random() * 0.5);
      setTimeout(tick, 100 + Math.random() * 100);
    };
    tick();
    return () => { animating = false; };
  }, [audioLevel, state]);

  const effectiveLevel = audioLevel ?? simulatedLevel;
  const active = isActiveState(state);
  const showWaveform = state === VoiceState.LISTENING;
  const transcript = interimTranscript || finalTranscript;

  return (
    <div
      className={`flex flex-col items-center gap-3 animate-fade-in ${className}`}
      role="region"
      aria-label="Voice input"
      aria-live="polite"
    >
      {/* Error state */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 text-sm text-error animate-slide-up"
          role="alert"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 flex-shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.06-1.06.75.75 0 0 1 1.06 1.06ZM10 8a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5A.75.75 0 0 1 10 8Z"
              clipRule="evenodd"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Waveform */}
      {showWaveform && (
        <div className="animate-scale-in">
          <Waveform active level={effectiveLevel} />
        </div>
      )}

      {/* Mic + Controls Row */}
      <div className="flex items-center gap-3">
        {/* Cancel button (visible when active) */}
        {active && (
          <button
            type="button"
            onClick={cancel}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-content-secondary transition-colors duration-fast hover:bg-surface-raised hover:text-content-primary"
            aria-label="Cancel voice input"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
            Cancel
          </button>
        )}

        <MicButton
          state={state}
          isSupported={isSupported}
          onStart={startListening}
          onStop={stopListening}
        />

        {/* Stop button (visible when listening) */}
        {state === VoiceState.LISTENING && (
          <button
            type="button"
            onClick={stopListening}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-error/10 px-3 text-sm text-error transition-colors duration-fast hover:bg-error/20"
            aria-label="Stop recording"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <rect x="5" y="5" width="10" height="10" rx="1" />
            </svg>
            Stop
          </button>
        )}
      </div>

      {/* State Label + Confidence */}
      {active && (
        <div className="flex items-center gap-2 text-sm animate-fade-in">
          {/* Processing spinner */}
          {isProcessingState(state) && (
            <svg
              className="h-3.5 w-3.5 animate-spin text-content-tertiary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
            </svg>
          )}
          <span className="text-content-secondary">{getStateLabel(state)}</span>
          {confidence > 0 && <ConfidenceScore confidence={confidence} />}
        </div>
      )}

      {/* Transcription preview */}
      {transcript && (
        <div
          className="max-w-prose rounded-lg bg-surface-raised px-3 py-2 text-sm text-content-primary animate-slide-up"
          aria-label="Transcription preview"
          aria-live="polite"
        >
          <span>{transcript}</span>
          {state === VoiceState.LISTENING && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-content-tertiary align-text-bottom" aria-hidden="true" />
          )}
        </div>
      )}

      {/* Not supported message */}
      {!isSupported && state === VoiceState.IDLE && !error && (
        <p className="text-xs text-content-tertiary" role="status">
          Voice input is not supported in this browser.
        </p>
      )}
    </div>
  );
}
