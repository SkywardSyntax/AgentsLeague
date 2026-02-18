/**
 * State machine types for the AI Whiteboard.
 *
 * Each state carries only the data valid in that state — no nullable
 * bags. The tagged union + TransitionMap guarantee exhaustiveness.
 */

import type { DrawingShape } from './drawing';
import type { UnitFloat } from './primitives';

// ── State definitions ───────────────────────────────────────────────

export interface IdleState {
  readonly status: 'idle';
}

export interface ProcessingState {
  readonly status: 'processing';
  readonly prompt: string;
  readonly requestId: string;
}

export interface DrawingState {
  readonly status: 'drawing';
  readonly shapes: readonly DrawingShape[];
  readonly progress: UnitFloat;
}

export interface ErrorState {
  readonly status: 'error';
  readonly message: string;
  readonly retryable: boolean;
  readonly previousStatus: Exclude<WhiteboardStatus, 'error'>;
}

export interface CompleteState {
  readonly status: 'complete';
  readonly shapes: readonly DrawingShape[];
}

// ── Tagged union ────────────────────────────────────────────────────

export type WhiteboardState =
  | IdleState
  | ProcessingState
  | DrawingState
  | ErrorState
  | CompleteState;

export type WhiteboardStatus = WhiteboardState['status'];

// ── Legal transitions ───────────────────────────────────────────────

export interface TransitionMap {
  idle: 'processing';
  processing: 'drawing' | 'error';
  drawing: 'complete' | 'error';
  error: 'idle';
  complete: 'idle';
}

// ── Events ──────────────────────────────────────────────────────────

export type WhiteboardEvent =
  | { readonly type: 'SUBMIT_PROMPT'; readonly prompt: string }
  | { readonly type: 'AI_RESPONSE'; readonly shapes: readonly DrawingShape[] }
  | { readonly type: 'DRAWING_PROGRESS'; readonly progress: UnitFloat }
  | { readonly type: 'DRAWING_COMPLETE' }
  | { readonly type: 'ERROR'; readonly message: string; readonly retryable: boolean }
  | { readonly type: 'RETRY' }
  | { readonly type: 'RESET' };

// ── Transition function ─────────────────────────────────────────────

export function transition(
  state: WhiteboardState,
  event: WhiteboardEvent,
): WhiteboardState {
  // Any state can receive an ERROR
  if (event.type === 'ERROR') {
    return {
      status: 'error',
      message: event.message,
      retryable: event.retryable,
      previousStatus: state.status === 'error' ? state.previousStatus : state.status,
    };
  }

  // RESET always returns to idle
  if (event.type === 'RESET') {
    return { status: 'idle' };
  }

  switch (state.status) {
    case 'idle':
      if (event.type === 'SUBMIT_PROMPT') {
        return {
          status: 'processing',
          prompt: event.prompt,
          requestId: crypto.randomUUID(),
        };
      }
      break;

    case 'processing':
      if (event.type === 'AI_RESPONSE') {
        return {
          status: 'drawing',
          shapes: event.shapes,
          progress: 0 as UnitFloat,
        };
      }
      break;

    case 'drawing':
      if (event.type === 'DRAWING_PROGRESS') {
        return { ...state, progress: event.progress };
      }
      if (event.type === 'DRAWING_COMPLETE') {
        return { status: 'complete', shapes: state.shapes };
      }
      break;

    case 'error':
      if (event.type === 'RETRY' && state.retryable) {
        return { status: 'idle' };
      }
      break;

    case 'complete':
      if (event.type === 'SUBMIT_PROMPT') {
        return {
          status: 'processing',
          prompt: event.prompt,
          requestId: crypto.randomUUID(),
        };
      }
      break;
  }

  return state; // no-op for invalid transitions
}
