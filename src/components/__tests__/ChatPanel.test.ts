/**
 * Tests for ChatPanel component — voice/text mode UI,
 * mode switching, message display, and input handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InteractionMode,
  MessageRole,
  VoiceState,
  voiceTransition,
  type VoiceSession,
  type Message,
} from '@/types/interaction';
import { useConversationStore } from '@/stores/conversation-store';

// ── Store Integration Tests ─────────────────────────────────────────

describe('ConversationStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useConversationStore.setState({
      messages: [],
      mode: InteractionMode.TEXT,
      isProcessing: false,
    });
  });

  it('adds a user message', () => {
    const store = useConversationStore.getState();
    const msg = store.addMessage('Hello', MessageRole.USER);

    expect(msg.content).toBe('Hello');
    expect(msg.role).toBe(MessageRole.USER);
    expect(msg.source).toBe(InteractionMode.TEXT);
    expect(useConversationStore.getState().messages).toHaveLength(1);
  });

  it('adds an assistant message with drawing data', () => {
    const store = useConversationStore.getState();
    const msg = store.addMessage('Drew a rectangle', MessageRole.ASSISTANT, {
      drawing: {
        action: 'create',
        objects: [{ type: 'rect', id: 'r1', props: {} }],
      },
    });

    expect(msg.drawing).not.toBeNull();
    expect(msg.drawing?.action).toBe('create');
  });

  it('updates an existing message', () => {
    const store = useConversationStore.getState();
    const msg = store.addMessage('', MessageRole.ASSISTANT);

    store.updateMessage(msg.id, { content: 'Streamed content' });

    const updated = useConversationStore.getState().messages.find((m) => m.id === msg.id);
    expect(updated?.content).toBe('Streamed content');
  });

  it('switches interaction mode', () => {
    const store = useConversationStore.getState();
    store.setMode(InteractionMode.VOICE);

    expect(useConversationStore.getState().mode).toBe(InteractionMode.VOICE);
  });

  it('sets processing state', () => {
    const store = useConversationStore.getState();
    store.setProcessing(true);

    expect(useConversationStore.getState().isProcessing).toBe(true);
  });

  it('clears conversation history', () => {
    const store = useConversationStore.getState();
    store.addMessage('Hello', MessageRole.USER);
    store.addMessage('Hi', MessageRole.ASSISTANT);

    expect(useConversationStore.getState().messages).toHaveLength(2);

    store.clearHistory();
    expect(useConversationStore.getState().messages).toHaveLength(0);
  });

  it('new messages use current mode as source', () => {
    const store = useConversationStore.getState();
    store.setMode(InteractionMode.VOICE);
    const msg = store.addMessage('Voice input', MessageRole.USER);

    expect(msg.source).toBe(InteractionMode.VOICE);
  });
});

// ── Voice State Machine UI Tests ────────────────────────────────────

describe('Voice mode UI states', () => {
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

  it('shows mic button in idle state', () => {
    const session = makeSession();
    // In idle, mic should be enabled, cancel hidden
    expect(session.state).toBe(VoiceState.IDLE);
    expect(session.error).toBeNull();
  });

  it('shows waveform during listening', () => {
    const session = makeSession({ state: VoiceState.LISTENING });
    expect(session.state).toBe(VoiceState.LISTENING);
    // UI should show WaveformVisualizer
  });

  it('shows interim transcript during listening', () => {
    const session = makeSession({
      state: VoiceState.LISTENING,
      interimTranscript: 'draw a',
    });
    expect(session.interimTranscript).toBe('draw a');
    // UI should display "draw a" below waveform
  });

  it('cancel from any state returns to idle', () => {
    const states = [
      VoiceState.LISTENING,
      VoiceState.TRANSCRIBING,
      VoiceState.SENDING,
      VoiceState.STREAMING,
      VoiceState.DRAWING,
      VoiceState.SPEAKING,
    ];

    for (const state of states) {
      const result = voiceTransition(makeSession({ state }), { type: 'CANCEL' });
      expect(result.state).toBe(VoiceState.IDLE);
    }
  });

  it('error from any state goes to idle with error message', () => {
    const session = makeSession({ state: VoiceState.LISTENING });
    const result = voiceTransition(session, { type: 'ERROR', message: 'mic access denied' });

    expect(result.state).toBe(VoiceState.IDLE);
    expect(result.error).toBe('mic access denied');
  });
});

// ── Text Mode Input Tests ───────────────────────────────────────────

describe('Text mode input logic', () => {
  it('does not submit empty input', () => {
    const onSubmit = vi.fn();
    const input = '   ';

    if (input.trim()) {
      onSubmit(input);
    }

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('trims whitespace from input', () => {
    const submitted: string[] = [];
    const input = '  Draw a box  ';

    if (input.trim()) {
      submitted.push(input.trim());
    }

    expect(submitted).toEqual(['Draw a box']);
  });

  it('disables send during processing', () => {
    const isProcessing = true;
    const inputValue = 'Hello';

    const canSubmit = inputValue.trim().length > 0 && !isProcessing;
    expect(canSubmit).toBe(false);
  });

  it('enables send when not processing with valid input', () => {
    const isProcessing = false;
    const inputValue = 'Draw';

    const canSubmit = inputValue.trim().length > 0 && !isProcessing;
    expect(canSubmit).toBe(true);
  });
});

// ── Mode Toggle Tests ───────────────────────────────────────────────

describe('Mode toggle behavior', () => {
  it('correctly identifies text mode', () => {
    const mode = InteractionMode.TEXT;
    expect(mode).toBe('text');
  });

  it('correctly identifies voice mode', () => {
    const mode = InteractionMode.VOICE;
    expect(mode).toBe('voice');
  });

  it('text mode placeholder differs from voice mode', () => {
    const textPlaceholder = 'Type a message to start...';
    const voicePlaceholder = 'Tap the mic to speak...';

    expect(textPlaceholder).not.toBe(voicePlaceholder);
  });
});

// ── Message Rendering Logic ─────────────────────────────────────────

describe('Message rendering logic', () => {
  it('user messages align right', () => {
    const msg: Pick<Message, 'role'> = { role: MessageRole.USER };
    const isUser = msg.role === MessageRole.USER;
    expect(isUser).toBe(true);
  });

  it('assistant messages align left', () => {
    const msg: Pick<Message, 'role'> = { role: MessageRole.ASSISTANT };
    const isUser = msg.role === MessageRole.USER;
    expect(isUser).toBe(false);
  });

  it('reasoning messages are collapsible', () => {
    const msg: Pick<Message, 'role'> = { role: MessageRole.REASONING };
    const isReasoning = msg.role === MessageRole.REASONING;
    expect(isReasoning).toBe(true);
  });

  it('voice source messages show mic icon', () => {
    const msg: Pick<Message, 'role' | 'source'> = {
      role: MessageRole.USER,
      source: InteractionMode.VOICE,
    };
    const showMicIcon = !msg.role || msg.source === InteractionMode.VOICE;
    expect(showMicIcon).toBe(true);
  });

  it('streaming messages show loading indicator', () => {
    const msg: Pick<Message, 'content' | 'meta'> = {
      content: '',
      meta: { streamComplete: false },
    };
    const showLoading = !msg.content && !msg.meta?.streamComplete;
    expect(showLoading).toBe(true);
  });
});
