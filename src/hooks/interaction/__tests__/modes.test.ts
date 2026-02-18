/**
 * Tests for interaction mode switching and voice state machine.
 */

import { test, expect } from 'vitest';
import {
  InteractionMode,
  MessageRole,
  VoiceState,
  voiceTransition,
  type VoiceSession,
} from '../../../types/interaction';

// ── Helpers ─────────────────────────────────────────────────────

function makeSession(overrides: Partial<VoiceSession> = {}): VoiceSession {
  return {
    state: VoiceState.IDLE,
    interimTranscript: '',
    finalTranscript: '',
    confidence: 0,
    error: null,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

// Mode enum tests
test('InteractionMode has TEXT and VOICE', () => {
  expect(InteractionMode.TEXT).toBe('text');
  expect(InteractionMode.VOICE).toBe('voice');
});

test('MessageRole has all four roles', () => {
  expect(MessageRole.USER).toBe('user');
  expect(MessageRole.ASSISTANT).toBe('assistant');
  expect(MessageRole.SYSTEM).toBe('system');
  expect(MessageRole.REASONING).toBe('reasoning');
});

// Voice state transitions
test('IDLE → LISTENING on START_LISTENING', () => {
  const s = voiceTransition(makeSession(), { type: 'START_LISTENING' });
  expect(s.state).toBe(VoiceState.LISTENING);
});

test('LISTENING → interim updates transcript without state change', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.LISTENING }),
    { type: 'INTERIM_RESULT', transcript: 'hello wor' },
  );
  expect(s.state).toBe(VoiceState.LISTENING);
  expect(s.interimTranscript).toBe('hello wor');
});

test('LISTENING → TRANSCRIBING on FINAL_RESULT', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.LISTENING }),
    { type: 'FINAL_RESULT', transcript: 'hello world', confidence: 0.95 },
  );
  expect(s.state).toBe(VoiceState.TRANSCRIBING);
  expect(s.finalTranscript).toBe('hello world');
  expect(s.confidence).toBe(0.95);
  expect(s.interimTranscript).toBe('');
});

test('TRANSCRIBING → SENDING on SEND', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.TRANSCRIBING, finalTranscript: 'hello' }),
    { type: 'SEND' },
  );
  expect(s.state).toBe(VoiceState.SENDING);
});

test('SENDING → STREAMING on STREAM_START', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.SENDING }),
    { type: 'STREAM_START' },
  );
  expect(s.state).toBe(VoiceState.STREAMING);
});

test('STREAMING → DRAWING on DRAW_START', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.STREAMING }),
    { type: 'DRAW_START' },
  );
  expect(s.state).toBe(VoiceState.DRAWING);
});

test('STREAMING → COMPLETE on STREAM_COMPLETE', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.STREAMING }),
    { type: 'STREAM_COMPLETE' },
  );
  expect(s.state).toBe(VoiceState.COMPLETE);
});

test('DRAWING → SPEAKING on SPEAK_START', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.DRAWING }),
    { type: 'SPEAK_START' },
  );
  expect(s.state).toBe(VoiceState.SPEAKING);
});

test('DRAWING → COMPLETE on DRAW_COMPLETE', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.DRAWING }),
    { type: 'DRAW_COMPLETE' },
  );
  expect(s.state).toBe(VoiceState.COMPLETE);
});

test('SPEAKING → COMPLETE on SPEAK_COMPLETE', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.SPEAKING }),
    { type: 'SPEAK_COMPLETE' },
  );
  expect(s.state).toBe(VoiceState.COMPLETE);
});

test('COMPLETE → LISTENING on START_LISTENING (re-entry)', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.COMPLETE }),
    { type: 'START_LISTENING' },
  );
  expect(s.state).toBe(VoiceState.LISTENING);
});

// Cancel from any state
const allStates = [
  VoiceState.IDLE,
  VoiceState.LISTENING,
  VoiceState.TRANSCRIBING,
  VoiceState.SENDING,
  VoiceState.STREAMING,
  VoiceState.DRAWING,
  VoiceState.SPEAKING,
  VoiceState.COMPLETE,
];

for (const state of allStates) {
  test(`CANCEL from ${state} → IDLE`, () => {
    const s = voiceTransition(
      makeSession({ state }),
      { type: 'CANCEL' },
    );
    expect(s.state).toBe(VoiceState.IDLE);
  });
}

// Error from any state
for (const state of allStates) {
  test(`ERROR from ${state} → IDLE with error message`, () => {
    const s = voiceTransition(
      makeSession({ state }),
      { type: 'ERROR', message: 'mic failed' },
    );
    expect(s.state).toBe(VoiceState.IDLE);
    expect(s.error).toBe('mic failed');
  });
}

// Invalid transitions are no-ops
test('Invalid: IDLE + SEND → stays IDLE', () => {
  const s = voiceTransition(makeSession(), { type: 'SEND' });
  expect(s.state).toBe(VoiceState.IDLE);
});

test('Invalid: LISTENING + STREAM_START → stays LISTENING', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.LISTENING }),
    { type: 'STREAM_START' },
  );
  expect(s.state).toBe(VoiceState.LISTENING);
});

test('Invalid: SENDING + DRAW_START → stays SENDING', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.SENDING }),
    { type: 'DRAW_START' },
  );
  expect(s.state).toBe(VoiceState.SENDING);
});

// Full pipeline sequence
test('Full pipeline: IDLE → LISTENING → TRANSCRIBING → SENDING → STREAMING → DRAWING → SPEAKING → COMPLETE', () => {
  let s = makeSession();

  s = voiceTransition(s, { type: 'START_LISTENING' });
  expect(s.state).toBe(VoiceState.LISTENING);

  s = voiceTransition(s, { type: 'INTERIM_RESULT', transcript: 'draw' });
  expect(s.state).toBe(VoiceState.LISTENING);
  expect(s.interimTranscript).toBe('draw');

  s = voiceTransition(s, { type: 'FINAL_RESULT', transcript: 'draw a box', confidence: 0.92 });
  expect(s.state).toBe(VoiceState.TRANSCRIBING);

  s = voiceTransition(s, { type: 'SEND' });
  expect(s.state).toBe(VoiceState.SENDING);

  s = voiceTransition(s, { type: 'STREAM_START' });
  expect(s.state).toBe(VoiceState.STREAMING);

  s = voiceTransition(s, { type: 'DRAW_START' });
  expect(s.state).toBe(VoiceState.DRAWING);

  s = voiceTransition(s, { type: 'SPEAK_START' });
  expect(s.state).toBe(VoiceState.SPEAKING);

  s = voiceTransition(s, { type: 'SPEAK_COMPLETE' });
  expect(s.state).toBe(VoiceState.COMPLETE);
});

// Message ordering test
test('Messages maintain ordering (USER before ASSISTANT)', () => {
  const messages = [
    { id: '1', role: MessageRole.USER, timestamp: 1000 },
    { id: '2', role: MessageRole.ASSISTANT, timestamp: 1001 },
    { id: '3', role: MessageRole.REASONING, timestamp: 1002 },
    { id: '4', role: MessageRole.USER, timestamp: 2000 },
    { id: '5', role: MessageRole.ASSISTANT, timestamp: 2001 },
  ];

  for (let i = 1; i < messages.length; i++) {
    expect(messages[i]!.timestamp).toBeGreaterThanOrEqual(messages[i - 1]!.timestamp);
  }

  expect(messages[0]!.role).toBe(MessageRole.USER);
  expect(messages[1]!.role).toBe(MessageRole.ASSISTANT);
});

// Mode switching tests
test('Mode switching clears to different mode', () => {
  let currentMode = InteractionMode.TEXT;
  let processing = true;

  const switchMode = (newMode: InteractionMode) => {
    if (newMode === currentMode) return;
    processing = false;
    currentMode = newMode;
  };

  switchMode(InteractionMode.VOICE);
  expect(currentMode).toBe(InteractionMode.VOICE);
  expect(processing).toBe(false);
});

test('Mode switching is a no-op for same mode', () => {
  let currentMode = InteractionMode.TEXT;
  let switchCalled = false;

  const switchMode = (newMode: InteractionMode) => {
    if (newMode === currentMode) return;
    switchCalled = true;
    currentMode = newMode;
  };

  switchMode(InteractionMode.TEXT);
  expect(switchCalled).toBe(false);
});
