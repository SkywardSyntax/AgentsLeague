'use client';

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  InteractionMode,
  MessageRole,
  VoiceState,
  type Message,
} from '@/types/interaction';
import { useConversationStore } from '@/stores/conversation-store';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { useInteractionMode } from '@/hooks/interaction/useInteractionMode';
import { useTextMode } from '@/hooks/interaction/useTextMode';
import { useVoiceMode } from '@/hooks/interaction/useVoiceMode';

// ── Helpers ─────────────────────────────────────────────────────

/** Parse markdown-style code fences into segments. */
function parseContent(text: string): { type: 'text' | 'code'; value: string; lang?: string }[] {
  const segments: { type: 'text' | 'code'; value: string; lang?: string }[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', value: text.slice(last, match.index) });
    }
    const lang = match[1] ?? undefined;
    segments.push(lang ? { type: 'code', value: match[2]!, lang } : { type: 'code', value: match[2]! });
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── CodeBlock ───────────────────────────────────────────────────

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div className="group relative my-2 rounded-lg overflow-hidden border border-border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between bg-surface-sunken px-3 py-1.5">
        <span className="text-xs text-content-tertiary font-mono">{lang ?? 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-content-tertiary hover:text-content-primary transition-colors duration-fast px-1.5 py-0.5 rounded-sm hover:bg-surface-raised"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {/* Code */}
      <pre className="overflow-x-auto bg-surface-sunken/50 px-3 py-2.5 text-xs leading-relaxed font-mono text-content-primary">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── TypingIndicator ─────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3 mx-3 sm:mx-4 animate-fade-in" role="status" aria-label="AI is typing">
      <div className="bg-surface-raised rounded-2xl rounded-bl-md px-4 py-3 shadow-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary animate-ai-thinking" aria-hidden="true" />
          <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary animate-ai-thinking" aria-hidden="true" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary animate-ai-thinking" aria-hidden="true" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}

// ── DrawingProgress ─────────────────────────────────────────────

function DrawingProgress() {
  const drawingState = useDrawingSessionStore((s) => s.drawingState);
  const iteration = useDrawingSessionStore((s) => s.toolLoopIteration);
  const toolCalls = useDrawingSessionStore((s) => s.toolCalls);

  if (drawingState.status === 'idle') return null;

  const statusLabel: Record<string, string> = {
    processing: 'Thinking…',
    drawing: 'Drawing…',
    error: 'Error occurred',
    complete: 'Complete',
  };

  return (
    <div className="mx-3 sm:mx-4 mb-3 animate-slide-up" role="status" aria-label={statusLabel[drawingState.status] ?? drawingState.status}>
      <div className="rounded-lg border border-ai/20 bg-ai-subtle px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-ai text-sm">✦</span>
          <span className="text-sm font-medium text-content-primary">
            {statusLabel[drawingState.status] ?? drawingState.status}
          </span>
        </div>
        {/* Progress bar */}
        {(drawingState.status === 'processing' || drawingState.status === 'drawing') && (
          <div className="h-1 rounded-full bg-surface-raised overflow-hidden">
            <div
              className="h-full rounded-full bg-ai transition-all duration-slow animate-shimmer"
              style={{
                width: drawingState.status === 'processing' ? '40%' : `${Math.min(95, 30 + iteration * 15)}%`,
                backgroundSize: '200% 100%',
                backgroundImage: 'linear-gradient(90deg, transparent, hsl(var(--color-ai) / 0.4), transparent)',
              }}
            />
          </div>
        )}
        {/* Step count */}
        {toolCalls.length > 0 && (
          <p className="text-xs text-content-tertiary mt-1.5">
            Step {iteration} · {toolCalls.length} operation{toolCalls.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ── MessageActions ──────────────────────────────────────────────

function MessageActions({
  message,
  onDelete,
  onRegenerate,
  onCopy,
}: {
  message: Message;
  onDelete: () => void;
  onRegenerate?: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-fast">
      <button
        type="button"
        onClick={onCopy}
        className="px-1.5 py-0.5 rounded-sm text-xs text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors duration-fast"
        aria-label="Copy message"
        title="Copy"
      >
        ⎘
      </button>
      {message.role === MessageRole.ASSISTANT && onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          className="px-1.5 py-0.5 rounded-sm text-xs text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors duration-fast"
          aria-label="Regenerate response"
          title="Regenerate"
        >
          ↻
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="px-1.5 py-0.5 rounded-sm text-xs text-content-tertiary hover:text-error hover:bg-surface-raised transition-colors duration-fast"
        aria-label="Delete message"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

// ── MessageBubble ───────────────────────────────────────────────

function MessageBubble({
  message,
  onDelete,
  onRegenerate,
}: {
  message: Message;
  onDelete: (id: string) => void;
  onRegenerate?: (message: Message) => void;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === MessageRole.USER;
  const isAssistant = message.role === MessageRole.ASSISTANT;
  const isSystem = message.role === MessageRole.SYSTEM;
  const isReasoning = message.role === MessageRole.REASONING;

  const handleCopyMessage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      /* noop */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [message.content]);

  // ── REASONING: collapsible section
  if (isReasoning) {
    return (
      <div className="mx-3 sm:mx-4 mb-2 animate-fade-in" role="group" aria-label="AI reasoning">
        <button
          onClick={() => setReasoningOpen(!reasoningOpen)}
          className="flex items-center gap-1.5 text-sm text-content-tertiary hover:text-content-secondary transition-colors duration-fast group/reason"
          type="button"
          aria-expanded={reasoningOpen}
          aria-controls={`reasoning-${message.id}`}
        >
          <span className="text-warning" aria-hidden="true">💡</span>
          <span className="font-medium">Reasoning</span>
          {message.reasoning?.confidence != null && (
            <span className="text-xs text-content-tertiary">
              ({Math.round(message.reasoning.confidence * 100)}%)
            </span>
          )}
          <svg
            className={`w-3 h-3 transition-transform duration-fast ${reasoningOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
        {reasoningOpen && (
          <div
            id={`reasoning-${message.id}`}
            className="mt-1.5 ml-6 p-3 bg-warning/5 rounded-lg text-sm text-content-secondary border border-warning/20 animate-scale-in"
            role="region"
            aria-label="Reasoning steps"
          >
            {message.content.split('\n').map((step, i) => (
              <p key={i} className={i < message.content.split('\n').length - 1 ? 'mb-1.5' : ''}>
                <span className="text-content-tertiary mr-1.5 text-xs">{i + 1}.</span>
                {step}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── SYSTEM: centered subtle message
  if (isSystem) {
    return (
      <div className="flex justify-center mb-3 mx-3 sm:mx-4 animate-fade-in">
        <div className="px-3 py-1.5 rounded-full bg-surface-raised text-xs text-content-tertiary shadow-xs">
          {message.content}
        </div>
      </div>
    );
  }

  // ── USER / ASSISTANT: chat bubbles
  const segments = isAssistant ? parseContent(message.content) : null;

  return (
    <div
      className={`group flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 mx-3 sm:mx-4 animate-slide-up`}
      style={{ animationDuration: '300ms' }}
      role="article"
      aria-label={`${isUser ? 'You' : isAssistant ? 'Assistant' : 'System'}: ${message.content || 'Loading...'}`}
    >
      <div className={`max-w-[85%] sm:max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-xs ${
            isUser
              ? 'bg-accent text-content-inverse rounded-br-md'
              : 'bg-surface-raised text-content-primary rounded-bl-md'
          }`}
        >
          {/* Voice badge */}
          {message.source === InteractionMode.VOICE && (
            <span className="inline-block mr-1 text-xs opacity-60" title="Voice input" aria-label="From voice input">🎤</span>
          )}

          {/* Content */}
          {!message.content ? (
            <TypingDots />
          ) : segments ? (
            segments.map((seg, i) =>
              seg.type === 'code' ? (
                <CodeBlock key={i} code={seg.value} {...(seg.lang ? { lang: seg.lang } : {})} />
              ) : (
                <MessageText key={i} text={seg.value} />
              ),
            )
          ) : (
            <MessageText text={message.content} />
          )}

          {/* Drawing badge */}
          {message.drawing && (
            <div className="mt-1.5 flex items-center gap-1 text-xs opacity-60">
              <span>🖊</span>
              <span>{message.drawing.objects.length} object{message.drawing.objects.length !== 1 ? 's' : ''} drawn</span>
            </div>
          )}
        </div>

        {/* Timestamp + actions */}
        <div className="flex items-center gap-1.5 mt-0.5 px-1">
          <span className="text-xs text-content-tertiary">{formatTimestamp(message.timestamp)}</span>
          {copied && <span className="text-xs text-success">Copied</span>}
          <MessageActions
            message={message}
            onDelete={() => onDelete(message.id)}
            {...(isAssistant && onRegenerate ? { onRegenerate: () => onRegenerate(message) } : {})}
            onCopy={handleCopyMessage}
          />
        </div>
      </div>
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i, arr) => (
        <span key={i}>
          {line}
          {i < arr.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" role="status" aria-label="Loading response">
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-ai-thinking" aria-hidden="true" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-ai-thinking" aria-hidden="true" style={{ animationDelay: '0.2s' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-ai-thinking" aria-hidden="true" style={{ animationDelay: '0.4s' }} />
    </span>
  );
}

// ── ModeToggle ──────────────────────────────────────────────────

function ModeToggle({ mode, onSwitch }: { mode: InteractionMode; onSwitch: (m: InteractionMode) => void }) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden text-sm" role="radiogroup" aria-label="Input mode">
      <button
        onClick={() => onSwitch(InteractionMode.TEXT)}
        className={`px-3 py-1.5 transition-colors duration-fast font-medium ${
          mode === InteractionMode.TEXT
            ? 'bg-accent text-content-inverse'
            : 'bg-surface text-content-secondary hover:bg-surface-raised'
        }`}
        type="button"
        role="radio"
        aria-checked={mode === InteractionMode.TEXT}
        aria-label="Text input mode"
      >
        Text
      </button>
      <button
        onClick={() => onSwitch(InteractionMode.VOICE)}
        className={`px-3 py-1.5 transition-colors duration-fast font-medium ${
          mode === InteractionMode.VOICE
            ? 'bg-accent text-content-inverse'
            : 'bg-surface text-content-secondary hover:bg-surface-raised'
        }`}
        type="button"
        role="radio"
        aria-checked={mode === InteractionMode.VOICE}
        aria-label="Voice input mode"
      >
        <span aria-hidden="true">🎤</span> Voice
      </button>
    </div>
  );
}

// ── WaveformVisualizer ──────────────────────────────────────────

const WAVEFORM_HEIGHTS = [28, 14, 22, 30, 18, 24, 12, 26, 20, 16, 29, 11, 23, 27, 15, 25, 13, 21, 31, 17];

function WaveformVisualizer() {
  return (
    <div
      className="flex items-center justify-center gap-0.5 h-8 px-4"
      role="status"
      aria-label="Listening for voice input"
    >
      {WAVEFORM_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className="w-1 bg-error rounded-full animate-pulse"
          style={{ height: `${h}px`, animationDelay: `${i * 0.05}s` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ── Main ChatPanel Component ────────────────────────────────────

export function ChatPanel() {
  const messages = useConversationStore((s) => s.messages);
  const isProcessing = useConversationStore((s) => s.isProcessing);
  const deleteMessage = useConversationStore((s) => s.deleteMessage);

  const { mode, switchMode } = useInteractionMode();
  const { handleSubmitText, isStreaming, stopStream } = useTextMode();
  const { session, startListening, stopListening, cancel, isSupported } = useVoiceMode();

  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Use requestAnimationFrame so DOM has updated
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [messages.length, isProcessing]);

  // ── Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [inputValue]);

  // ── Submit text message
  const submitMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isProcessing) return;
      void handleSubmitText(text);
      setInputValue('');
    },
    [isProcessing, handleSubmitText],
  );

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      submitMessage(inputValue);
    },
    [inputValue, submitMessage],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitMessage(inputValue);
      }
    },
    [inputValue, submitMessage],
  );

  // ── Regenerate last assistant message
  const handleRegenerate = useCallback(
    (assistantMsg: Message) => {
      // Find the user message that preceded the assistant message
      const idx = messages.findIndex((m) => m.id === assistantMsg.id);
      const precedingUser = messages
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === MessageRole.USER);
      if (!precedingUser) return;

      // Delete the old assistant message, then resubmit
      deleteMessage(assistantMsg.id);
      void handleSubmitText(precedingUser.content);
    },
    [messages, deleteMessage, handleSubmitText],
  );

  const isListening = session.state === VoiceState.LISTENING;
  const showTypingIndicator =
    isProcessing && messages[messages.length - 1]?.role !== MessageRole.ASSISTANT;

  return (
    <div className="flex flex-col h-full w-full bg-surface border-r border-border-subtle">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle backdrop-blur-toolbar sm:px-4 sm:py-3">
        <h2 className="text-sm font-semibold text-content-primary tracking-snug sm:text-base">Chat</h2>
        <ModeToggle mode={mode} onSwitch={switchMode} />
      </div>

      {/* ── Message list ───────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain py-4 scroll-smooth"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-ai-subtle flex items-center justify-center mb-3">
              <span className="text-ai text-xl">✦</span>
            </div>
            <p className="text-sm text-content-secondary font-medium mb-1">
              {mode === InteractionMode.TEXT ? 'Start a conversation' : 'Tap the mic to speak'}
            </p>
            <p className="text-xs text-content-tertiary">
              {mode === InteractionMode.TEXT
                ? 'Type a message to ask the AI to draw something'
                : 'Your voice will be transcribed and sent to the AI'}
            </p>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onDelete={deleteMessage}
            {...(msg.role === MessageRole.ASSISTANT ? { onRegenerate: handleRegenerate } : {})}
          />
        ))}

        {/* Drawing progress */}
        <DrawingProgress />

        {/* Typing indicator */}
        {showTypingIndicator && <TypingIndicator />}
      </div>

      {/* ── Voice waveform ─────────────────────────────────── */}
      {mode === InteractionMode.VOICE && isListening && <WaveformVisualizer />}

      {/* ── Interim transcript ─────────────────────────────── */}
      {mode === InteractionMode.VOICE && session.interimTranscript && (
        <div className="px-4 py-2 text-sm text-content-tertiary italic border-t border-border-subtle animate-fade-in">
          {session.interimTranscript}
        </div>
      )}

      {/* ── Input area ─────────────────────────────────────── */}
      <div className="border-t border-border-subtle p-2 sm:p-3 bg-surface">
        {mode === InteractionMode.TEXT ? (
          <form onSubmit={onSubmit} className="flex gap-2 items-end" aria-label="Chat message form">
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <textarea
              id="chat-input"
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message…"
              className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent min-h-[44px] max-h-[120px] transition-colors duration-fast"
              rows={1}
              disabled={isProcessing}
              aria-label="Message input"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStream}
                className="min-h-[44px] min-w-[44px] rounded-lg bg-error px-3 py-2 text-sm font-medium text-content-inverse hover:opacity-90 transition-opacity duration-fast"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputValue.trim() || isProcessing}
                className="min-h-[44px] min-w-[44px] rounded-lg bg-accent px-3 py-2 text-sm font-medium text-content-inverse hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast"
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
              className={`w-12 h-12 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-xl transition-all duration-normal ${
                isListening
                  ? 'bg-error text-content-inverse animate-pulse shadow-lg'
                  : 'bg-surface-raised text-content-secondary hover:bg-surface-sunken'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={isListening ? 'Stop listening' : 'Start listening'}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
              🎤
            </button>
            {(isListening || session.state !== VoiceState.IDLE) && (
              <button
                type="button"
                onClick={cancel}
                className="min-h-[44px] rounded-lg px-3 py-1.5 text-sm text-content-tertiary hover:text-content-primary hover:bg-surface-raised transition-colors duration-fast"
              >
                Cancel
              </button>
            )}
            {!isSupported && (
              <span className="text-xs text-error">Speech not supported</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
