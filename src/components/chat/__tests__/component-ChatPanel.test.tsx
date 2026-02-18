/**
 * Tests for ChatPanel component.
 * Covers: message display, auto-scroll, typing indicator,
 * text/voice mode, input submission, mode toggle, regenerate, delete.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import { ChatPanel } from '../ChatPanel';
import { useConversationStore } from '@/stores/conversation-store';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { InteractionMode, MessageRole, VoiceState, type VoiceSession } from '@/types/interaction';

// ── Polyfill scrollTo for jsdom ─────────────────────────────────

Element.prototype.scrollTo = vi.fn();

// ── Mocks ───────────────────────────────────────────────────────

const mockHandleSubmitText = vi.fn();
const mockStopStream = vi.fn();
const mockStartListening = vi.fn();
const mockStopListening = vi.fn();
const mockCancel = vi.fn();
const mockSwitchMode = vi.fn();

let mockMode = InteractionMode.TEXT;
let mockIsStreaming = false;
let mockSession: VoiceSession = {
  state: VoiceState.IDLE,
  interimTranscript: '',
  finalTranscript: '',
  confidence: 0,
  error: null,
};
let mockIsVoiceSupported = true;

vi.mock('@/hooks/interaction/useInteractionMode', () => ({
  useInteractionMode: () => ({
    mode: mockMode,
    switchMode: mockSwitchMode,
  }),
}));

vi.mock('@/hooks/interaction/useTextMode', () => ({
  useTextMode: () => ({
    handleSubmitText: mockHandleSubmitText,
    isStreaming: mockIsStreaming,
    stopStream: mockStopStream,
    streamedText: '',
  }),
}));

vi.mock('@/hooks/interaction/useVoiceMode', () => ({
  useVoiceMode: () => ({
    session: mockSession,
    startListening: mockStartListening,
    stopListening: mockStopListening,
    cancel: mockCancel,
    isSupported: mockIsVoiceSupported,
  }),
}));

function renderChatPanel() {
  return render(createElement(ChatPanel));
}

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMode = InteractionMode.TEXT;
    mockIsStreaming = false;
    mockSession = {
      state: VoiceState.IDLE,
      interimTranscript: '',
      finalTranscript: '',
      confidence: 0,
      error: null,
    };
    mockIsVoiceSupported = true;

    useConversationStore.setState({
      messages: [],
      mode: InteractionMode.TEXT,
      isProcessing: false,
    });

    useDrawingSessionStore.setState({
      drawingState: { status: 'idle' },
      toolLoopIteration: 0,
      canvasSnapshot: [],
      toolCalls: [],
    });
  });

  // ── Rendering ─────────────────────────────────────────────

  describe('rendering', () => {
    it('renders header with Chat title', () => {
      renderChatPanel();
      expect(screen.getByText('Chat')).toBeDefined();
    });

    it('renders message list with log role', () => {
      renderChatPanel();
      expect(screen.getByRole('log', { name: 'Chat messages' })).toBeDefined();
    });

    it('shows empty state in text mode', () => {
      renderChatPanel();
      expect(screen.getByText('Start a conversation')).toBeDefined();
    });

    it('shows empty state in voice mode', () => {
      mockMode = InteractionMode.VOICE;
      renderChatPanel();
      expect(screen.getByText('Tap the mic to speak')).toBeDefined();
    });

    it('snapshot matches empty state', () => {
      const { container } = renderChatPanel();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── Message Display ───────────────────────────────────────

  describe('message display', () => {
    it('displays user messages', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-1',
            role: MessageRole.USER,
            content: 'Hello world',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      expect(screen.getByText('Hello world')).toBeDefined();
    });

    it('displays assistant messages', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-2',
            role: MessageRole.ASSISTANT,
            content: 'I drew a rectangle',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      expect(screen.getByText('I drew a rectangle')).toBeDefined();
    });

    it('displays system messages centered', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-sys',
            role: MessageRole.SYSTEM,
            content: 'Session started',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      expect(screen.getByText('Session started')).toBeDefined();
    });

    it('shows voice badge for voice-sourced messages', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-v',
            role: MessageRole.USER,
            content: 'Draw a circle',
            timestamp: Date.now(),
            source: InteractionMode.VOICE,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      const badge = screen.getByTitle('Voice input');
      expect(badge).toBeDefined();
    });

    it('shows drawing badge when message has drawing data', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-d',
            role: MessageRole.ASSISTANT,
            content: 'Done!',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: {
              action: 'create',
              objects: [
                { type: 'rect', id: 'r1', props: {} },
                { type: 'ellipse', id: 'e1', props: {} },
              ],
            },
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      expect(screen.getByText('2 objects drawn')).toBeDefined();
    });
  });

  // ── Typing Indicator ──────────────────────────────────────

  describe('typing indicator', () => {
    it('shows typing indicator when processing and no assistant message yet', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-u',
            role: MessageRole.USER,
            content: 'Draw something',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
        isProcessing: true,
      });

      renderChatPanel();
      expect(screen.getByRole('status', { name: 'AI is typing' })).toBeDefined();
    });

    it('hides typing indicator when last message is from assistant', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-a',
            role: MessageRole.ASSISTANT,
            content: 'Here you go',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
        isProcessing: true,
      });

      renderChatPanel();
      expect(screen.queryByRole('status', { name: 'AI is typing' })).toBeNull();
    });
  });

  // ── Text Input ────────────────────────────────────────────

  describe('text input', () => {
    it('renders text input form in text mode', () => {
      renderChatPanel();
      expect(screen.getByRole('form', { name: 'Chat message form' })).toBeDefined();
    });

    it('disables send button when input is empty', () => {
      renderChatPanel();
      const sendBtn = screen.getByRole('button', { name: 'Send' });
      expect(sendBtn.hasAttribute('disabled')).toBe(true);
    });

    it('enables send button when input has text', () => {
      renderChatPanel();
      const textarea = screen.getByLabelText('Message input');
      fireEvent.change(textarea, { target: { value: 'Hello' } });
      const sendBtn = screen.getByRole('button', { name: 'Send' });
      expect(sendBtn.hasAttribute('disabled')).toBe(false);
    });

    it('submits on form submit', () => {
      renderChatPanel();
      const textarea = screen.getByLabelText('Message input');
      fireEvent.change(textarea, { target: { value: 'Draw a box' } });

      const form = screen.getByRole('form', { name: 'Chat message form' });
      fireEvent.submit(form);

      expect(mockHandleSubmitText).toHaveBeenCalledWith('Draw a box');
    });

    it('submits on Enter key (without shift)', () => {
      renderChatPanel();
      const textarea = screen.getByLabelText('Message input');
      fireEvent.change(textarea, { target: { value: 'Hello AI' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(mockHandleSubmitText).toHaveBeenCalledWith('Hello AI');
    });

    it('does not submit on Shift+Enter', () => {
      renderChatPanel();
      const textarea = screen.getByLabelText('Message input');
      fireEvent.change(textarea, { target: { value: 'Hello' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(mockHandleSubmitText).not.toHaveBeenCalled();
    });

    it('clears input after submission', () => {
      renderChatPanel();
      const textarea = screen.getByLabelText('Message input') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Test' } });

      const form = screen.getByRole('form', { name: 'Chat message form' });
      fireEvent.submit(form);

      expect(textarea.value).toBe('');
    });

    it('does not submit empty or whitespace-only input', () => {
      renderChatPanel();
      const textarea = screen.getByLabelText('Message input');
      fireEvent.change(textarea, { target: { value: '   ' } });

      const form = screen.getByRole('form', { name: 'Chat message form' });
      fireEvent.submit(form);

      expect(mockHandleSubmitText).not.toHaveBeenCalled();
    });

    it('shows Stop button when streaming', () => {
      mockIsStreaming = true;
      renderChatPanel();
      const stopBtn = screen.getByText('Stop');
      expect(stopBtn).toBeDefined();
    });

    it('calls stopStream when Stop button clicked', () => {
      mockIsStreaming = true;
      renderChatPanel();
      const stopBtn = screen.getByText('Stop');
      fireEvent.click(stopBtn);
      expect(mockStopStream).toHaveBeenCalled();
    });
  });

  // ── Voice Mode ────────────────────────────────────────────

  describe('voice mode', () => {
    beforeEach(() => {
      mockMode = InteractionMode.VOICE;
    });

    it('renders mic button in voice mode', () => {
      renderChatPanel();
      expect(screen.getByLabelText('Start listening')).toBeDefined();
    });

    it('calls startListening when mic button clicked', () => {
      renderChatPanel();
      const micBtn = screen.getByLabelText('Start listening');
      fireEvent.click(micBtn);
      expect(mockStartListening).toHaveBeenCalled();
    });

    it('shows stop listening label when actively listening', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING };
      renderChatPanel();
      expect(screen.getByLabelText('Stop listening')).toBeDefined();
    });

    it('calls stopListening when listening mic button clicked', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING };
      renderChatPanel();
      const stopBtn = screen.getByLabelText('Stop listening');
      fireEvent.click(stopBtn);
      expect(mockStopListening).toHaveBeenCalled();
    });

    it('shows cancel button when active', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING };
      renderChatPanel();
      expect(screen.getByText('Cancel')).toBeDefined();
    });

    it('calls cancel when cancel button clicked', () => {
      mockSession = { ...mockSession, state: VoiceState.LISTENING };
      renderChatPanel();
      fireEvent.click(screen.getByText('Cancel'));
      expect(mockCancel).toHaveBeenCalled();
    });

    it('shows speech not supported message when unsupported', () => {
      mockIsVoiceSupported = false;
      renderChatPanel();
      expect(screen.getByText('Speech not supported')).toBeDefined();
    });

    it('shows interim transcript when available', () => {
      mockSession = {
        ...mockSession,
        state: VoiceState.LISTENING,
        interimTranscript: 'draw a red',
      };
      renderChatPanel();
      expect(screen.getByText('draw a red')).toBeDefined();
    });
  });

  // ── Mode Toggle (inline) ──────────────────────────────────

  describe('mode toggle', () => {
    it('renders mode toggle radiogroup', () => {
      renderChatPanel();
      expect(screen.getByRole('radiogroup', { name: 'Input mode' })).toBeDefined();
    });

    it('text mode radio is checked in text mode', () => {
      renderChatPanel();
      const textRadio = screen.getByRole('radio', { name: 'Text input mode' });
      expect(textRadio.getAttribute('aria-checked')).toBe('true');
    });

    it('clicking voice radio calls switchMode', () => {
      renderChatPanel();
      const voiceRadio = screen.getByRole('radio', { name: 'Voice input mode' });
      fireEvent.click(voiceRadio);
      expect(mockSwitchMode).toHaveBeenCalledWith(InteractionMode.VOICE);
    });
  });

  // ── Reasoning messages ────────────────────────────────────

  describe('reasoning messages', () => {
    it('renders reasoning with collapsible toggle', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-r',
            role: MessageRole.REASONING,
            content: 'Step 1\nStep 2',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: { steps: ['Step 1', 'Step 2'], confidence: 0.88 },
          },
        ],
      });

      renderChatPanel();
      const toggle = screen.getByRole('button', { name: /Reasoning/i });
      expect(toggle).toBeDefined();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('expands reasoning content on click', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-r2',
            role: MessageRole.REASONING,
            content: 'Analyzing\nPlanning',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: { steps: ['Analyzing', 'Planning'], confidence: 0.9 },
          },
        ],
      });

      renderChatPanel();
      const toggle = screen.getByRole('button', { name: /Reasoning/i });
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Analyzing')).toBeDefined();
      expect(screen.getByText('Planning')).toBeDefined();
    });
  });

  // ── Message Actions ───────────────────────────────────────

  describe('message actions', () => {
    it('renders delete button for messages', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-del',
            role: MessageRole.USER,
            content: 'Test message',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      expect(screen.getByLabelText('Delete message')).toBeDefined();
    });

    it('renders regenerate button for assistant messages', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-regen',
            role: MessageRole.ASSISTANT,
            content: 'Some response',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      expect(screen.getByLabelText('Regenerate response')).toBeDefined();
    });

    it('renders copy button for messages', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-copy',
            role: MessageRole.USER,
            content: 'Copy me',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      expect(screen.getByLabelText('Copy message')).toBeDefined();
    });
  });

  // ── Code blocks ───────────────────────────────────────────

  describe('code blocks', () => {
    it('renders code blocks from markdown fences', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-code',
            role: MessageRole.ASSISTANT,
            content: 'Here is code:\n```js\nconsole.log("hi")\n```',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      expect(screen.getByText('console.log("hi")')).toBeDefined();
      expect(screen.getByText('js')).toBeDefined();
    });

    it('renders copy button on code blocks', () => {
      useConversationStore.setState({
        messages: [
          {
            id: 'msg-code2',
            role: MessageRole.ASSISTANT,
            content: '```python\nprint("hi")\n```',
            timestamp: Date.now(),
            source: InteractionMode.TEXT,
            drawing: null,
            reasoning: null,
          },
        ],
      });

      renderChatPanel();
      const copyBtn = screen.getByLabelText('Copy code');
      expect(copyBtn).toBeDefined();
    });
  });
});
