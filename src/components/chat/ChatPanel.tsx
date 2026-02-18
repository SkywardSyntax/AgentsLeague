'use client';

import { useState, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import {
  InteractionMode,
  MessageRole,
  VoiceState,
} from '@/types/interaction';
import { useConversationStore } from '@/stores/conversation-store';
import { useInteractionMode } from '@/hooks/interaction/useInteractionMode';
import { useTextMode } from '@/hooks/interaction/useTextMode';
import { useVoiceMode } from '@/hooks/interaction/useVoiceMode';

// ── Sub-components ──────────────────────────────────────────────

function MessageBubble({ message }: { message: { id: string; role: MessageRole; content: string; source: InteractionMode; reasoning?: { steps: readonly string[]; confidence: number } | null } }) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const isUser = message.role === MessageRole.USER;
  const isReasoning = message.role === MessageRole.REASONING;

  if (isReasoning) {
    return (
      <div className="mx-4 mb-2">
        <button
          onClick={() => setReasoningOpen(!reasoningOpen)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          type="button"
        >
          <span>💡</span>
          <span>Reasoning</span>
          <span className="text-xs">{reasoningOpen ? '▲' : '▼'}</span>
        </button>
        {reasoningOpen && (
          <div className="mt-1 ml-5 p-3 bg-amber-50 rounded-lg text-sm text-gray-700 border border-amber-200">
            {message.content.split('\n').map((step, i) => (
              <p key={i} className="mb-1">
                {step}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 mx-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        }`}
      >
        {!isUser && message.source === InteractionMode.VOICE && (
          <span className="mr-1" title="Voice input">🎤</span>
        )}
        {message.content || (
          <span className="inline-flex gap-1">
            <span className="animate-bounce">●</span>
            <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
            <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
          </span>
        )}
      </div>
    </div>
  );
}

function ModeToggle({ mode, onSwitch }: { mode: InteractionMode; onSwitch: (m: InteractionMode) => void }) {
  return (
    <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
      <button
        onClick={() => onSwitch(InteractionMode.TEXT)}
        className={`px-3 py-1.5 transition-colors ${
          mode === InteractionMode.TEXT ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        type="button"
      >
        Text
      </button>
      <button
        onClick={() => onSwitch(InteractionMode.VOICE)}
        className={`px-3 py-1.5 transition-colors ${
          mode === InteractionMode.VOICE ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        type="button"
      >
        🎤 Voice
      </button>
    </div>
  );
}

// Pre-computed heights for waveform bars
const WAVEFORM_HEIGHTS = [28, 14, 22, 30, 18, 24, 12, 26, 20, 16, 29, 11, 23, 27, 15, 25, 13, 21, 31, 17];

function WaveformVisualizer() {
  return (
    <div className="flex items-center justify-center gap-0.5 h-8 px-4">
      {WAVEFORM_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className="w-1 bg-red-500 rounded-full animate-pulse"
          style={{
            height: `${h}px`,
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Main ChatPanel Component ────────────────────────────────────

export function ChatPanel() {
  const messages = useConversationStore((s) => s.messages);
  const isProcessing = useConversationStore((s) => s.isProcessing);

  const { mode, switchMode } = useInteractionMode();
  const { handleSubmitText, isStreaming, stopStream } = useTextMode();
  const { session, startListening, stopListening, cancel, isSupported } = useVoiceMode();

  const [inputValue, setInputValue] = useState('');

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isProcessing) return;
      void handleSubmitText(inputValue);
      setInputValue('');
    },
    [inputValue, isProcessing, handleSubmitText],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!inputValue.trim() || isProcessing) return;
        void handleSubmitText(inputValue);
        setInputValue('');
      }
    },
    [inputValue, isProcessing, handleSubmitText],
  );

  const isListening = session.state === VoiceState.LISTENING;

  return (
    <div className="flex flex-col h-full w-[360px] border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-800">Chat</h2>
        <ModeToggle mode={mode} onSwitch={switchMode} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-8">
            {mode === InteractionMode.TEXT
              ? 'Type a message to start...'
              : 'Tap the mic to speak...'}
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isProcessing && messages[messages.length - 1]?.role !== MessageRole.ASSISTANT && (
          <div className="flex justify-start mb-3 mx-4">
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm">
              <span className="inline-flex gap-1">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Voice waveform */}
      {mode === InteractionMode.VOICE && isListening && <WaveformVisualizer />}

      {/* Interim transcript */}
      {mode === InteractionMode.VOICE && session.interimTranscript && (
        <div className="px-4 py-2 text-sm text-gray-500 italic border-t border-gray-100">
          {session.interimTranscript}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-200 p-3">
        {mode === InteractionMode.TEXT ? (
          <form onSubmit={onSubmit} className="flex gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message..."
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px] max-h-[120px]"
              rows={1}
              disabled={isProcessing}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStream}
                className="px-3 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputValue.trim() || isProcessing}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            )}
          </form>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              disabled={!isSupported || (isProcessing && !isListening)}
              className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={isListening ? 'Stop listening' : 'Start listening'}
            >
              🎤
            </button>
            {(isListening || session.state !== VoiceState.IDLE) && (
              <button
                type="button"
                onClick={cancel}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            )}
            {!isSupported && (
              <span className="text-xs text-red-500">Speech not supported</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
