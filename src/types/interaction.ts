/**
 * Interaction mode types for the AI Whiteboard.
 *
 * ── Voice State Machine ─────────────────────────────────────────
 *
 *              ┌────────┐
 *       ┌──────│  IDLE  │◄──────────────────────────────┐
 *       │      └────────┘                               │
 *  (tap mic)                                     (complete / cancel)
 *       │                                               │
 *       ▼                                               │
 *  ┌────────────┐                                       │
 *  │ LISTENING  │ ── (silence / stop) ──┐               │
 *  └────────────┘                       │               │
 *       │                               ▼               │
 *  (interim text)               ┌──────────────┐        │
 *       └───────────────────────│ TRANSCRIBING │        │
 *                               └──────┬───────┘        │
 *                                      │                │
 *                               (transcript ready)      │
 *                                      │                │
 *                                      ▼                │
 *                               ┌──────────┐            │
 *                               │ SENDING  │            │
 *                               └────┬─────┘            │
 *                                    │                  │
 *                             (first token)             │
 *                                    │                  │
 *                                    ▼                  │
 *                            ┌────────────┐             │
 *                            │ STREAMING  │             │
 *                            └─────┬──────┘             │
 *                                  │                    │
 *                           (draw commands)             │
 *                                  │                    │
 *                                  ▼                    │
 *                            ┌──────────┐               │
 *                            │ DRAWING  │               │
 *                            └────┬─────┘               │
 *                                 │                     │
 *                            (TTS opt.)                 │
 *                                 │                     │
 *                                 ▼                     │
 *                            ┌──────────┐               │
 *                            │ SPEAKING │               │
 *                            └────┬─────┘               │
 *                                 │                     │
 *                                 ▼                     │
 *                            ┌──────────┐               │
 *                            │ COMPLETE │───────────────┘
 *                            └──────────┘
 *
 *  Any state ──(cancel)──► IDLE
 */

// ── Interaction Mode ────────────────────────────────────────────

export enum InteractionMode {
  TEXT = 'text',
  VOICE = 'voice',
}

// ── Message Role ────────────────────────────────────────────────

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  REASONING = 'reasoning',
}

// ── Voice State Machine ─────────────────────────────────────────

export enum VoiceState {
  IDLE = 'idle',
  LISTENING = 'listening',
  TRANSCRIBING = 'transcribing',
  SENDING = 'sending',
  STREAMING = 'streaming',
  DRAWING = 'drawing',
  SPEAKING = 'speaking',
  COMPLETE = 'complete',
}

/** Legal voice state transitions. */
export type VoiceTransitionMap = {
  idle: 'listening';
  listening: 'transcribing' | 'idle';
  transcribing: 'sending' | 'idle';
  sending: 'streaming' | 'idle';
  streaming: 'drawing' | 'complete' | 'idle';
  drawing: 'speaking' | 'complete' | 'idle';
  speaking: 'complete' | 'idle';
  complete: 'idle';
};

// ── Drawing Command ─────────────────────────────────────────────

export interface DrawingCommand {
  readonly action: 'create' | 'modify' | 'delete' | 'clear';
  readonly objects: readonly DrawObject[];
}

export interface DrawObject {
  readonly type: 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'freeform' | 'group';
  readonly id: string;
  readonly props: Record<string, unknown>;
}

// ── Reasoning Data ──────────────────────────────────────────────

export interface ReasoningData {
  readonly steps: readonly string[];
  readonly confidence: number;
}

// ── Message ─────────────────────────────────────────────────────

export interface Message {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: number;
  readonly source: InteractionMode;
  readonly drawing?: DrawingCommand | null;
  readonly reasoning?: ReasoningData | null;
  readonly meta?: {
    readonly voiceTranscriptConfidence?: number;
    readonly streamComplete?: boolean;
    readonly drawObjectIds?: readonly string[];
  };
}

// ── Conversation History ────────────────────────────────────────

export interface ConversationHistory {
  readonly messages: readonly Message[];
  readonly mode: InteractionMode;
  readonly isProcessing: boolean;
  readonly streamBuffer: string;
  readonly pendingDrawCommands: DrawingCommand | null;
}

// ── Voice Session ───────────────────────────────────────────────

export interface VoiceSession {
  readonly state: VoiceState;
  readonly interimTranscript: string;
  readonly finalTranscript: string;
  readonly confidence: number;
  readonly error: string | null;
}

// ── Voice Events ────────────────────────────────────────────────

export type VoiceEvent =
  | { readonly type: 'START_LISTENING' }
  | { readonly type: 'INTERIM_RESULT'; readonly transcript: string }
  | { readonly type: 'FINAL_RESULT'; readonly transcript: string; readonly confidence: number }
  | { readonly type: 'SEND' }
  | { readonly type: 'STREAM_START' }
  | { readonly type: 'STREAM_COMPLETE' }
  | { readonly type: 'DRAW_START' }
  | { readonly type: 'DRAW_COMPLETE' }
  | { readonly type: 'SPEAK_START' }
  | { readonly type: 'SPEAK_COMPLETE' }
  | { readonly type: 'CANCEL' }
  | { readonly type: 'ERROR'; readonly message: string };

// ── Voice state transition function ─────────────────────────────

export function voiceTransition(
  session: VoiceSession,
  event: VoiceEvent,
): VoiceSession {
  // Cancel always returns to idle
  if (event.type === 'CANCEL') {
    return { state: VoiceState.IDLE, interimTranscript: '', finalTranscript: '', confidence: 0, error: null };
  }

  if (event.type === 'ERROR') {
    return { ...session, state: VoiceState.IDLE, error: event.message };
  }

  switch (session.state) {
    case VoiceState.IDLE:
      if (event.type === 'START_LISTENING') {
        return { ...session, state: VoiceState.LISTENING, interimTranscript: '', finalTranscript: '', confidence: 0, error: null };
      }
      break;

    case VoiceState.LISTENING:
      if (event.type === 'INTERIM_RESULT') {
        return { ...session, interimTranscript: event.transcript };
      }
      if (event.type === 'FINAL_RESULT') {
        return { ...session, state: VoiceState.TRANSCRIBING, finalTranscript: event.transcript, confidence: event.confidence, interimTranscript: '' };
      }
      break;

    case VoiceState.TRANSCRIBING:
      if (event.type === 'SEND') {
        return { ...session, state: VoiceState.SENDING };
      }
      break;

    case VoiceState.SENDING:
      if (event.type === 'STREAM_START') {
        return { ...session, state: VoiceState.STREAMING };
      }
      break;

    case VoiceState.STREAMING:
      if (event.type === 'DRAW_START') {
        return { ...session, state: VoiceState.DRAWING };
      }
      if (event.type === 'STREAM_COMPLETE') {
        return { ...session, state: VoiceState.COMPLETE };
      }
      break;

    case VoiceState.DRAWING:
      if (event.type === 'SPEAK_START') {
        return { ...session, state: VoiceState.SPEAKING };
      }
      if (event.type === 'DRAW_COMPLETE') {
        return { ...session, state: VoiceState.COMPLETE };
      }
      break;

    case VoiceState.SPEAKING:
      if (event.type === 'SPEAK_COMPLETE') {
        return { ...session, state: VoiceState.COMPLETE };
      }
      break;

    case VoiceState.COMPLETE:
      if (event.type === 'START_LISTENING') {
        return { ...session, state: VoiceState.LISTENING, interimTranscript: '', finalTranscript: '', confidence: 0, error: null };
      }
      break;
  }

  return session; // no-op for invalid transitions
}
