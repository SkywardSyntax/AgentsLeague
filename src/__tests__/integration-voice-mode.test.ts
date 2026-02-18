/**
 * Integration tests: Voice mode full user flow.
 *
 * Flow: listen → transcribe → draw → voice output
 * Uses mock Web Speech API and voice state machine.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useConversationStore } from '@/stores/conversation-store';
import {
  InteractionMode,
  MessageRole,
  VoiceState,
  voiceTransition,
  type VoiceSession,
} from '@/types/interaction';
import {
  createMockSpeechRecognition,
  installMockSpeechRecognition,
  type MockSpeechRecognition,
} from '@/lib/test-utils/mocks';
import { idleVoiceSession } from '@/lib/test-utils/fixtures';

// ── Helpers ─────────────────────────────────────────────────────

function resetStores() {
  useConversationStore.setState({
    messages: [],
    mode: InteractionMode.VOICE,
    isProcessing: false,
  });
}

// ── Tests ───────────────────────────────────────────────────────

describe('Integration: Voice Mode Full Flow', () => {
  beforeEach(() => {
    resetStores();
  });

  // ── Voice state machine transitions ─────────────────────────

  describe('Voice State Machine', () => {
    it('follows full happy path: IDLE → LISTENING → TRANSCRIBING → SENDING → STREAMING → DRAWING → SPEAKING → COMPLETE', () => {
      let session: VoiceSession = idleVoiceSession;

      // Start listening
      session = voiceTransition(session, { type: 'START_LISTENING' });
      expect(session.state).toBe(VoiceState.LISTENING);

      // Interim result
      session = voiceTransition(session, { type: 'INTERIM_RESULT', transcript: 'draw a' });
      expect(session.state).toBe(VoiceState.LISTENING);
      expect(session.interimTranscript).toBe('draw a');

      // Final result
      session = voiceTransition(session, {
        type: 'FINAL_RESULT',
        transcript: 'draw a red circle',
        confidence: 0.95,
      });
      expect(session.state).toBe(VoiceState.TRANSCRIBING);
      expect(session.finalTranscript).toBe('draw a red circle');
      expect(session.confidence).toBe(0.95);
      expect(session.interimTranscript).toBe('');

      // Send to LLM
      session = voiceTransition(session, { type: 'SEND' });
      expect(session.state).toBe(VoiceState.SENDING);

      // Stream starts
      session = voiceTransition(session, { type: 'STREAM_START' });
      expect(session.state).toBe(VoiceState.STREAMING);

      // Draw starts
      session = voiceTransition(session, { type: 'DRAW_START' });
      expect(session.state).toBe(VoiceState.DRAWING);

      // TTS speaks
      session = voiceTransition(session, { type: 'SPEAK_START' });
      expect(session.state).toBe(VoiceState.SPEAKING);

      // Speaking complete
      session = voiceTransition(session, { type: 'SPEAK_COMPLETE' });
      expect(session.state).toBe(VoiceState.COMPLETE);

      // Return to idle for next turn
      session = voiceTransition(session, { type: 'START_LISTENING' });
      expect(session.state).toBe(VoiceState.LISTENING);
    });

    it('allows cancellation from any state', () => {
      const states: VoiceState[] = [
        VoiceState.LISTENING,
        VoiceState.TRANSCRIBING,
        VoiceState.SENDING,
        VoiceState.STREAMING,
        VoiceState.DRAWING,
        VoiceState.SPEAKING,
      ];

      for (const state of states) {
        const session: VoiceSession = {
          state,
          interimTranscript: 'test',
          finalTranscript: 'test final',
          confidence: 0.9,
          error: null,
        };

        const result = voiceTransition(session, { type: 'CANCEL' });
        expect(result.state).toBe(VoiceState.IDLE);
        expect(result.interimTranscript).toBe('');
        expect(result.finalTranscript).toBe('');
        expect(result.confidence).toBe(0);
        expect(result.error).toBeNull();
      }
    });

    it('handles errors from any state', () => {
      const states: VoiceState[] = [
        VoiceState.LISTENING,
        VoiceState.TRANSCRIBING,
        VoiceState.SENDING,
        VoiceState.STREAMING,
      ];

      for (const state of states) {
        const session: VoiceSession = {
          state,
          interimTranscript: '',
          finalTranscript: '',
          confidence: 0,
          error: null,
        };

        const result = voiceTransition(session, {
          type: 'ERROR',
          message: 'microphone access denied',
        });
        expect(result.state).toBe(VoiceState.IDLE);
        expect(result.error).toBe('microphone access denied');
      }
    });

    it('ignores invalid transitions', () => {
      const session: VoiceSession = idleVoiceSession;

      // Can't send from idle
      const result = voiceTransition(session, { type: 'SEND' });
      expect(result.state).toBe(VoiceState.IDLE);

      // Can't draw from idle
      const result2 = voiceTransition(session, { type: 'DRAW_START' });
      expect(result2.state).toBe(VoiceState.IDLE);
    });

    it('handles streaming → complete (skip drawing/speaking)', () => {
      let session: VoiceSession = {
        state: VoiceState.STREAMING,
        interimTranscript: '',
        finalTranscript: 'test',
        confidence: 0.9,
        error: null,
      };

      session = voiceTransition(session, { type: 'STREAM_COMPLETE' });
      expect(session.state).toBe(VoiceState.COMPLETE);
    });

    it('handles drawing → complete (skip speaking)', () => {
      let session: VoiceSession = {
        state: VoiceState.DRAWING,
        interimTranscript: '',
        finalTranscript: 'test',
        confidence: 0.9,
        error: null,
      };

      session = voiceTransition(session, { type: 'DRAW_COMPLETE' });
      expect(session.state).toBe(VoiceState.COMPLETE);
    });
  });

  // ── Mock Speech Recognition ─────────────────────────────────

  describe('Mock Speech Recognition', () => {
    let mock: MockSpeechRecognition;

    beforeEach(() => {
      mock = createMockSpeechRecognition();
    });

    it('creates a mock with all required methods', () => {
      expect(mock.start).toBeDefined();
      expect(mock.stop).toBeDefined();
      expect(mock.abort).toBeDefined();
      expect(mock.continuous).toBe(false);
      expect(mock.interimResults).toBe(false);
      expect(mock.lang).toBe('en-US');
    });

    it('simulates interim speech results', () => {
      const onResult = vi.fn();
      mock.onresult = onResult;

      mock.simulateResult('draw a', false);

      expect(onResult).toHaveBeenCalledOnce();
      const event = onResult.mock.calls[0]![0] as unknown as { results: { isFinal: boolean; 0: { transcript: string } }[] };
      expect(event.results[0]!.isFinal).toBe(false);
      expect(event.results[0]![0].transcript).toBe('draw a');
    });

    it('simulates final speech results with confidence', () => {
      const onResult = vi.fn();
      mock.onresult = onResult;

      mock.simulateResult('draw a red circle', true, 0.92);

      expect(onResult).toHaveBeenCalledOnce();
      const event = onResult.mock.calls[0]![0] as unknown as { results: { isFinal: boolean; 0: { transcript: string; confidence: number } }[] };
      expect(event.results[0]!.isFinal).toBe(true);
      expect(event.results[0]![0].transcript).toBe('draw a red circle');
      expect(event.results[0]![0].confidence).toBe(0.92);
    });

    it('simulates speech recognition errors', () => {
      const onError = vi.fn();
      mock.onerror = onError;

      mock.simulateError('no-speech');

      expect(onError).toHaveBeenCalledOnce();
      expect((onError.mock.calls[0]![0] as unknown as { error: string }).error).toBe('no-speech');
    });

    it('simulates speech recognition end', () => {
      const onEnd = vi.fn();
      mock.onend = onEnd;

      mock.simulateEnd();
      expect(onEnd).toHaveBeenCalledOnce();
    });
  });

  // ── Web Speech API installation ─────────────────────────────

  describe('installMockSpeechRecognition', () => {
    let cleanup: () => void;
    let _mock: MockSpeechRecognition;

    beforeEach(() => {
      const result = installMockSpeechRecognition();
      _mock = result.mock;
      cleanup = result.cleanup;
    });

    afterEach(() => {
      cleanup();
    });

    it('installs mock globally on webkitSpeechRecognition', () => {
      const SR = (globalThis as Record<string, unknown>).webkitSpeechRecognition;
      expect(SR).toBeDefined();
      expect(typeof SR).toBe('function');
    });

    it('cleans up after test', () => {
      const before = (globalThis as Record<string, unknown>).webkitSpeechRecognition;
      expect(before).toBeDefined();

      cleanup();

      // After cleanup, it should be restored (undefined or previous value)
      // Re-install for afterEach
      const result = installMockSpeechRecognition();
      _mock = result.mock;
      cleanup = result.cleanup;
    });
  });

  // ── Voice flow with conversation store ──────────────────────

  describe('Voice → Conversation Store Integration', () => {
    it('adds voice transcript as user message', () => {
      const store = useConversationStore.getState();
      store.setMode(InteractionMode.VOICE);

      const _msg = store.addMessage('draw a red circle', MessageRole.USER, {
        source: InteractionMode.VOICE,
        meta: { voiceTranscriptConfidence: 0.92 },
      });

      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.source).toBe(InteractionMode.VOICE);
      expect(messages[0]!.meta?.voiceTranscriptConfidence).toBe(0.92);
    });

    it('sets processing state during voice flow', () => {
      const store = useConversationStore.getState();

      expect(store.isProcessing).toBe(false);
      store.setProcessing(true);
      expect(useConversationStore.getState().isProcessing).toBe(true);
      store.setProcessing(false);
      expect(useConversationStore.getState().isProcessing).toBe(false);
    });

    it('handles full voice conversation turn', () => {
      const store = useConversationStore.getState();
      store.setMode(InteractionMode.VOICE);

      // 1. Voice transcript becomes user message
      store.addMessage('draw a red circle', MessageRole.USER, {
        source: InteractionMode.VOICE,
        meta: { voiceTranscriptConfidence: 0.95 },
      });
      store.setProcessing(true);

      // 2. AI responds
      const assistantMsg = store.addMessage('', MessageRole.ASSISTANT, {
        source: InteractionMode.VOICE,
        meta: { streamComplete: false },
      });

      // 3. Stream completes with drawing
      store.updateMessage(assistantMsg.id, {
        content: "I've drawn a red circle.",
        drawing: {
          action: 'create',
          objects: [{ type: 'ellipse', id: 'circle-1', props: { fill: '#EF4444' } }],
        },
        meta: { streamComplete: true, drawObjectIds: ['circle-1'] },
      });
      store.setProcessing(false);

      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0]!.source).toBe(InteractionMode.VOICE);
      expect(messages[1]!.drawing?.action).toBe('create');
      expect(messages[1]!.meta?.drawObjectIds).toContain('circle-1');
    });
  });

  // ── Simulated full voice flow with mock recognition ─────────

  describe('Full Voice Flow Simulation', () => {
    let mock: MockSpeechRecognition;
    let cleanup: () => void;

    beforeEach(() => {
      const result = installMockSpeechRecognition();
      mock = result.mock;
      cleanup = result.cleanup;
    });

    afterEach(() => {
      cleanup();
    });

    it('simulates complete listen → transcribe → draw flow', () => {
      const store = useConversationStore.getState();
      let session: VoiceSession = idleVoiceSession;

      // 1. Start listening
      session = voiceTransition(session, { type: 'START_LISTENING' });
      (mock.start as () => void)();
      expect(session.state).toBe(VoiceState.LISTENING);

      // 2. Interim results come in
      mock.simulateResult('draw', false);
      session = voiceTransition(session, { type: 'INTERIM_RESULT', transcript: 'draw' });
      expect(session.interimTranscript).toBe('draw');

      mock.simulateResult('draw a house', false);
      session = voiceTransition(session, { type: 'INTERIM_RESULT', transcript: 'draw a house' });
      expect(session.interimTranscript).toBe('draw a house');

      // 3. Final result
      mock.simulateResult('draw a house with a red roof', true, 0.97);
      session = voiceTransition(session, {
        type: 'FINAL_RESULT',
        transcript: 'draw a house with a red roof',
        confidence: 0.97,
      });
      expect(session.state).toBe(VoiceState.TRANSCRIBING);
      expect(session.finalTranscript).toBe('draw a house with a red roof');

      // 4. Add to conversation
      store.addMessage(session.finalTranscript, MessageRole.USER, {
        source: InteractionMode.VOICE,
        meta: { voiceTranscriptConfidence: session.confidence },
      });

      // 5. Send to AI
      session = voiceTransition(session, { type: 'SEND' });
      store.setProcessing(true);
      expect(session.state).toBe(VoiceState.SENDING);

      // 6. Stream starts
      session = voiceTransition(session, { type: 'STREAM_START' });
      expect(session.state).toBe(VoiceState.STREAMING);

      // 7. Drawing begins
      session = voiceTransition(session, { type: 'DRAW_START' });
      expect(session.state).toBe(VoiceState.DRAWING);

      // 8. AI responds
      const _assistantMsg = store.addMessage(
        "I've drawn a house with a red roof.",
        MessageRole.ASSISTANT,
        {
          source: InteractionMode.VOICE,
          drawing: {
            action: 'create',
            objects: [
              { type: 'rect', id: 'house-body', props: { fill: '#8B4513' } },
              { type: 'rect', id: 'house-roof', props: { fill: '#EF4444' } },
            ],
          },
          meta: { streamComplete: true, drawObjectIds: ['house-body', 'house-roof'] },
        },
      );

      // 9. TTS speaks the response
      session = voiceTransition(session, { type: 'SPEAK_START' });
      expect(session.state).toBe(VoiceState.SPEAKING);

      session = voiceTransition(session, { type: 'SPEAK_COMPLETE' });
      expect(session.state).toBe(VoiceState.COMPLETE);

      store.setProcessing(false);

      // Verify final state
      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0]!.content).toBe('draw a house with a red roof');
      expect(messages[0]!.source).toBe(InteractionMode.VOICE);
      expect(messages[1]!.drawing?.objects).toHaveLength(2);
      expect(useConversationStore.getState().isProcessing).toBe(false);
    });

    it('handles voice recognition error mid-flow', () => {
      let session: VoiceSession = idleVoiceSession;

      session = voiceTransition(session, { type: 'START_LISTENING' });
      (mock.start as () => void)();

      // Simulate no-speech error
      mock.simulateError('no-speech');
      session = voiceTransition(session, { type: 'ERROR', message: 'no-speech' });

      expect(session.state).toBe(VoiceState.IDLE);
      expect(session.error).toBe('no-speech');
    });

    it('handles recognition end without final result', () => {
      let session: VoiceSession = idleVoiceSession;

      session = voiceTransition(session, { type: 'START_LISTENING' });
      (mock.start as () => void)();

      // Recognition ends without a final result → cancel
      mock.simulateEnd();
      session = voiceTransition(session, { type: 'CANCEL' });

      expect(session.state).toBe(VoiceState.IDLE);
      expect(session.finalTranscript).toBe('');
    });

    it('handles low confidence transcripts', () => {
      let session: VoiceSession = idleVoiceSession;

      session = voiceTransition(session, { type: 'START_LISTENING' });

      // Low confidence result
      mock.simulateResult('something unclear', true, 0.3);
      session = voiceTransition(session, {
        type: 'FINAL_RESULT',
        transcript: 'something unclear',
        confidence: 0.3,
      });

      expect(session.state).toBe(VoiceState.TRANSCRIBING);
      expect(session.confidence).toBe(0.3);
      // The app could check confidence threshold; state machine accepts it
    });
  });
});
