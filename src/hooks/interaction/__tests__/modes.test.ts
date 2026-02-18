/**
 * Tests for interaction mode switching and voice state machine.
 *
 * Run via: npx tsx --test src/hooks/interaction/__tests__/modes.test.ts
 * or with any test runner that supports TypeScript.
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

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Tests ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log('\n── Voice State Machine Tests ──\n');

// Mode enum tests
test('InteractionMode has TEXT and VOICE', () => {
  assertEqual(InteractionMode.TEXT, 'text', 'TEXT');
  assertEqual(InteractionMode.VOICE, 'voice', 'VOICE');
});

test('MessageRole has all four roles', () => {
  assertEqual(MessageRole.USER, 'user', 'USER');
  assertEqual(MessageRole.ASSISTANT, 'assistant', 'ASSISTANT');
  assertEqual(MessageRole.SYSTEM, 'system', 'SYSTEM');
  assertEqual(MessageRole.REASONING, 'reasoning', 'REASONING');
});

// Voice state transitions
test('IDLE → LISTENING on START_LISTENING', () => {
  const s = voiceTransition(makeSession(), { type: 'START_LISTENING' });
  assertEqual(s.state, VoiceState.LISTENING, 'state');
});

test('LISTENING → interim updates transcript without state change', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.LISTENING }),
    { type: 'INTERIM_RESULT', transcript: 'hello wor' },
  );
  assertEqual(s.state, VoiceState.LISTENING, 'state');
  assertEqual(s.interimTranscript, 'hello wor', 'interimTranscript');
});

test('LISTENING → TRANSCRIBING on FINAL_RESULT', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.LISTENING }),
    { type: 'FINAL_RESULT', transcript: 'hello world', confidence: 0.95 },
  );
  assertEqual(s.state, VoiceState.TRANSCRIBING, 'state');
  assertEqual(s.finalTranscript, 'hello world', 'finalTranscript');
  assertEqual(s.confidence, 0.95, 'confidence');
  assertEqual(s.interimTranscript, '', 'interimTranscript cleared');
});

test('TRANSCRIBING → SENDING on SEND', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.TRANSCRIBING, finalTranscript: 'hello' }),
    { type: 'SEND' },
  );
  assertEqual(s.state, VoiceState.SENDING, 'state');
});

test('SENDING → STREAMING on STREAM_START', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.SENDING }),
    { type: 'STREAM_START' },
  );
  assertEqual(s.state, VoiceState.STREAMING, 'state');
});

test('STREAMING → DRAWING on DRAW_START', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.STREAMING }),
    { type: 'DRAW_START' },
  );
  assertEqual(s.state, VoiceState.DRAWING, 'state');
});

test('STREAMING → COMPLETE on STREAM_COMPLETE', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.STREAMING }),
    { type: 'STREAM_COMPLETE' },
  );
  assertEqual(s.state, VoiceState.COMPLETE, 'state');
});

test('DRAWING → SPEAKING on SPEAK_START', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.DRAWING }),
    { type: 'SPEAK_START' },
  );
  assertEqual(s.state, VoiceState.SPEAKING, 'state');
});

test('DRAWING → COMPLETE on DRAW_COMPLETE', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.DRAWING }),
    { type: 'DRAW_COMPLETE' },
  );
  assertEqual(s.state, VoiceState.COMPLETE, 'state');
});

test('SPEAKING → COMPLETE on SPEAK_COMPLETE', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.SPEAKING }),
    { type: 'SPEAK_COMPLETE' },
  );
  assertEqual(s.state, VoiceState.COMPLETE, 'state');
});

test('COMPLETE → LISTENING on START_LISTENING (re-entry)', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.COMPLETE }),
    { type: 'START_LISTENING' },
  );
  assertEqual(s.state, VoiceState.LISTENING, 'state');
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
    assertEqual(s.state, VoiceState.IDLE, 'state');
  });
}

// Error from any state
for (const state of allStates) {
  test(`ERROR from ${state} → IDLE with error message`, () => {
    const s = voiceTransition(
      makeSession({ state }),
      { type: 'ERROR', message: 'mic failed' },
    );
    assertEqual(s.state, VoiceState.IDLE, 'state');
    assertEqual(s.error, 'mic failed', 'error message');
  });
}

// Invalid transitions are no-ops
test('Invalid: IDLE + SEND → stays IDLE', () => {
  const s = voiceTransition(makeSession(), { type: 'SEND' });
  assertEqual(s.state, VoiceState.IDLE, 'state');
});

test('Invalid: LISTENING + STREAM_START → stays LISTENING', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.LISTENING }),
    { type: 'STREAM_START' },
  );
  assertEqual(s.state, VoiceState.LISTENING, 'state');
});

test('Invalid: SENDING + DRAW_START → stays SENDING', () => {
  const s = voiceTransition(
    makeSession({ state: VoiceState.SENDING }),
    { type: 'DRAW_START' },
  );
  assertEqual(s.state, VoiceState.SENDING, 'state');
});

// Full pipeline sequence
test('Full pipeline: IDLE → LISTENING → TRANSCRIBING → SENDING → STREAMING → DRAWING → SPEAKING → COMPLETE', () => {
  let s = makeSession();

  s = voiceTransition(s, { type: 'START_LISTENING' });
  assertEqual(s.state, VoiceState.LISTENING, 'step 1');

  s = voiceTransition(s, { type: 'INTERIM_RESULT', transcript: 'draw' });
  assertEqual(s.state, VoiceState.LISTENING, 'interim still listening');
  assertEqual(s.interimTranscript, 'draw', 'interim text');

  s = voiceTransition(s, { type: 'FINAL_RESULT', transcript: 'draw a box', confidence: 0.92 });
  assertEqual(s.state, VoiceState.TRANSCRIBING, 'step 2');

  s = voiceTransition(s, { type: 'SEND' });
  assertEqual(s.state, VoiceState.SENDING, 'step 3');

  s = voiceTransition(s, { type: 'STREAM_START' });
  assertEqual(s.state, VoiceState.STREAMING, 'step 4');

  s = voiceTransition(s, { type: 'DRAW_START' });
  assertEqual(s.state, VoiceState.DRAWING, 'step 5');

  s = voiceTransition(s, { type: 'SPEAK_START' });
  assertEqual(s.state, VoiceState.SPEAKING, 'step 6');

  s = voiceTransition(s, { type: 'SPEAK_COMPLETE' });
  assertEqual(s.state, VoiceState.COMPLETE, 'step 7');
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

  // Verify timestamps are monotonically increasing
  for (let i = 1; i < messages.length; i++) {
    assert(
      messages[i]!.timestamp >= messages[i - 1]!.timestamp,
      `Message ${messages[i]!.id} should be after ${messages[i - 1]!.id}`,
    );
  }

  // Verify USER always precedes its ASSISTANT response
  assertEqual(messages[0]!.role, MessageRole.USER, 'first is USER');
  assertEqual(messages[1]!.role, MessageRole.ASSISTANT, 'second is ASSISTANT');
});

// Mode switching tests
test('Mode switching clears to different mode', () => {
  // This tests the logic - in the real hook, setProcessing(false) is called
  let currentMode = InteractionMode.TEXT;
  let processing = true;

  // Simulate switchMode
  const switchMode = (newMode: InteractionMode) => {
    if (newMode === currentMode) return;
    processing = false;
    currentMode = newMode;
  };

  switchMode(InteractionMode.VOICE);
  assertEqual(currentMode, InteractionMode.VOICE, 'mode switched');
  assertEqual(processing, false, 'processing cleared');
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
  assertEqual(switchCalled, false, 'no switch for same mode');
});

// ── Summary ─────────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
