/**
 * Integration tests: Mode switching with active conversation.
 *
 * Tests TEXT ↔ VOICE switching, state preservation, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useConversationStore } from '@/stores/conversation-store';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { InteractionMode, MessageRole, VoiceState, voiceTransition } from '@/types/interaction';
import type { VoiceSession } from '@/types/interaction';
import { idleVoiceSession } from '@/lib/test-utils/fixtures';

// ── Helpers ─────────────────────────────────────────────────────

function resetStores() {
  useConversationStore.setState({
    messages: [],
    mode: InteractionMode.TEXT,
    isProcessing: false,
  });
  useDrawingSessionStore.getState().reset();
}

// ── Tests ───────────────────────────────────────────────────────

describe('Integration: Mode Switching', () => {
  beforeEach(() => {
    resetStores();
  });

  // ── Basic mode switching ────────────────────────────────────

  describe('Basic Switching', () => {
    it('switches from TEXT to VOICE mode', () => {
      const store = useConversationStore.getState();
      expect(store.mode).toBe(InteractionMode.TEXT);

      store.setMode(InteractionMode.VOICE);
      expect(useConversationStore.getState().mode).toBe(InteractionMode.VOICE);
    });

    it('switches from VOICE to TEXT mode', () => {
      const store = useConversationStore.getState();
      store.setMode(InteractionMode.VOICE);
      store.setMode(InteractionMode.TEXT);
      expect(useConversationStore.getState().mode).toBe(InteractionMode.TEXT);
    });

    it('no-ops when switching to the same mode', () => {
      const store = useConversationStore.getState();
      store.setMode(InteractionMode.TEXT);
      expect(useConversationStore.getState().mode).toBe(InteractionMode.TEXT);
    });
  });

  // ── Processing state on switch ──────────────────────────────

  describe('Processing State', () => {
    it('clears processing state on mode switch (useInteractionMode behavior)', () => {
      const store = useConversationStore.getState();
      store.setProcessing(true);
      expect(useConversationStore.getState().isProcessing).toBe(true);

      // Simulate switchMode: clear processing + change mode
      store.setProcessing(false);
      store.setMode(InteractionMode.VOICE);

      expect(useConversationStore.getState().isProcessing).toBe(false);
      expect(useConversationStore.getState().mode).toBe(InteractionMode.VOICE);
    });

    it('preserves messages when switching modes', () => {
      const store = useConversationStore.getState();

      // Add messages in TEXT mode
      store.addMessage('Hello', MessageRole.USER, { source: InteractionMode.TEXT });
      store.addMessage('Hi there!', MessageRole.ASSISTANT, { source: InteractionMode.TEXT });

      // Switch to VOICE
      store.setMode(InteractionMode.VOICE);

      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0]!.source).toBe(InteractionMode.TEXT);
      expect(messages[1]!.source).toBe(InteractionMode.TEXT);
    });
  });

  // ── Active conversation during switch ───────────────────────

  describe('Switch with Active Conversation', () => {
    it('preserves mixed-mode conversation history', () => {
      const store = useConversationStore.getState();

      // Text messages
      store.addMessage('Draw a circle', MessageRole.USER, { source: InteractionMode.TEXT });
      store.addMessage('Done!', MessageRole.ASSISTANT, { source: InteractionMode.TEXT });

      // Switch to voice
      store.setMode(InteractionMode.VOICE);

      // Voice messages
      store.addMessage('Make it red', MessageRole.USER, {
        source: InteractionMode.VOICE,
        meta: { voiceTranscriptConfidence: 0.95 },
      });
      store.addMessage('Changed to red.', MessageRole.ASSISTANT, {
        source: InteractionMode.VOICE,
      });

      // Switch back to text
      store.setMode(InteractionMode.TEXT);

      // Add more text
      store.addMessage('Add a label', MessageRole.USER, { source: InteractionMode.TEXT });

      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(5);

      // Check sources are preserved
      expect(messages[0]!.source).toBe(InteractionMode.TEXT);
      expect(messages[1]!.source).toBe(InteractionMode.TEXT);
      expect(messages[2]!.source).toBe(InteractionMode.VOICE);
      expect(messages[3]!.source).toBe(InteractionMode.VOICE);
      expect(messages[4]!.source).toBe(InteractionMode.TEXT);
    });

    it('handles switch during active streaming', () => {
      const store = useConversationStore.getState();

      // Start streaming in TEXT mode
      store.setProcessing(true);
      const _msg = store.addMessage('', MessageRole.ASSISTANT, {
        source: InteractionMode.TEXT,
        meta: { streamComplete: false },
      });

      // Switch to VOICE while streaming (should clear processing)
      store.setProcessing(false);
      store.setMode(InteractionMode.VOICE);

      expect(useConversationStore.getState().isProcessing).toBe(false);
      expect(useConversationStore.getState().mode).toBe(InteractionMode.VOICE);

      // The incomplete message is still there
      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.meta?.streamComplete).toBe(false);
    });

    it('handles rapid mode switches', () => {
      const store = useConversationStore.getState();

      for (let i = 0; i < 10; i++) {
        store.setMode(i % 2 === 0 ? InteractionMode.VOICE : InteractionMode.TEXT);
      }

      // Should end on TEXT (even iterations are VOICE, last i=9 is odd → TEXT)
      expect(useConversationStore.getState().mode).toBe(InteractionMode.TEXT);
    });
  });

  // ── Voice state and mode switching ──────────────────────────

  describe('Voice State During Mode Switch', () => {
    it('voice session should be cancelled when switching to text', () => {
      let session: VoiceSession = idleVoiceSession;

      // Start voice flow
      session = voiceTransition(session, { type: 'START_LISTENING' });
      expect(session.state).toBe(VoiceState.LISTENING);

      // Switch to text mode → cancel voice
      session = voiceTransition(session, { type: 'CANCEL' });
      expect(session.state).toBe(VoiceState.IDLE);

      useConversationStore.getState().setMode(InteractionMode.TEXT);
      expect(useConversationStore.getState().mode).toBe(InteractionMode.TEXT);
    });

    it('voice session mid-streaming should be cancellable on switch', () => {
      let session: VoiceSession = idleVoiceSession;

      // Advance to STREAMING state
      session = voiceTransition(session, { type: 'START_LISTENING' });
      session = voiceTransition(session, {
        type: 'FINAL_RESULT',
        transcript: 'test',
        confidence: 0.9,
      });
      session = voiceTransition(session, { type: 'SEND' });
      session = voiceTransition(session, { type: 'STREAM_START' });
      expect(session.state).toBe(VoiceState.STREAMING);

      // Cancel and switch
      session = voiceTransition(session, { type: 'CANCEL' });
      expect(session.state).toBe(VoiceState.IDLE);

      const store = useConversationStore.getState();
      store.setProcessing(false);
      store.setMode(InteractionMode.TEXT);
      expect(useConversationStore.getState().isProcessing).toBe(false);
    });
  });

  // ── Drawing session state across modes ──────────────────────

  describe('Drawing Session Across Modes', () => {
    it('drawing session state persists across mode switches', () => {
      const sessionStore = useDrawingSessionStore.getState();

      // Start drawing in TEXT mode
      sessionStore.setDrawingState({
        status: 'processing',
        prompt: 'draw something',
        requestId: 'req-1',
      });

      // Switch mode
      useConversationStore.getState().setMode(InteractionMode.VOICE);

      // Drawing session should still have its state
      expect(useDrawingSessionStore.getState().drawingState.status).toBe('processing');
    });

    it('reset drawing session clears independently from mode', () => {
      const sessionStore = useDrawingSessionStore.getState();
      sessionStore.setDrawingState({
        status: 'processing',
        prompt: 'test',
        requestId: 'r1',
      });

      sessionStore.reset();

      expect(useDrawingSessionStore.getState().drawingState.status).toBe('idle');
      // Mode unchanged
      expect(useConversationStore.getState().mode).toBe(InteractionMode.TEXT);
    });
  });

  // ── Message source tracking ─────────────────────────────────

  describe('Message Source Tracking', () => {
    it('new messages use current mode as default source', () => {
      const store = useConversationStore.getState();

      store.setMode(InteractionMode.TEXT);
      const msg1 = store.addMessage('text msg', MessageRole.USER);
      expect(msg1.source).toBe(InteractionMode.TEXT);

      store.setMode(InteractionMode.VOICE);
      const msg2 = store.addMessage('voice msg', MessageRole.USER);
      expect(msg2.source).toBe(InteractionMode.VOICE);
    });

    it('explicit source overrides current mode', () => {
      const store = useConversationStore.getState();
      store.setMode(InteractionMode.TEXT);

      const msg = store.addMessage('voice override', MessageRole.USER, {
        source: InteractionMode.VOICE,
      });
      expect(msg.source).toBe(InteractionMode.VOICE);
    });
  });
});
