'use client';

import { useRef } from 'react';
import type { ChatMessage } from '@/types/agent';
import { MessageContent } from './MessageContent';
import { PillButton } from '@/components/ui/PillButton';

export interface ChatThreadMeta {
  id: string;
  title: string;
  messageCount: number;
}

interface ChatPanelProps {
  chats: ChatThreadMeta[];
  activeChatId: string;
  messages: ChatMessage[];
  input: string;
  status: 'idle' | 'thinking' | 'streaming' | 'drawing';
  onInput: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onSelectChat: (chatId: string) => void;
  onCreateChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onClearChat: () => void;
  disabled: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatPanel({
  chats,
  activeChatId,
  messages,
  input,
  status,
  onInput,
  onSend,
  onCancel,
  onSelectChat,
  onCreateChat,
  onDeleteChat,
  onDeleteMessage,
  onClearChat,
  disabled,
  inputRef,
}: ChatPanelProps) {
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const canManageChats = status === 'idle';
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  // Mark all current message IDs as seen after render, animate only new ones
  const currentIds = new Set(messages.map((m) => m.id));
  const newMessageIds = new Set<string>();
  for (const id of currentIds) {
    if (!seenMessageIdsRef.current.has(id)) newMessageIds.add(id);
  }
  // Defer marking as seen so the animation class is applied on this render
  queueMicrotask(() => {
    seenMessageIdsRef.current = currentIds;
  });

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <div className="scrollbar-thin flex items-center gap-2 overflow-x-auto pb-0.5">
          {chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <PillButton
                key={chat.id}
                variant={isActive ? 'accent' : 'default'}
                onClick={() => onSelectChat(chat.id)}
                disabled={!canManageChats || isActive}
                className={`group flex shrink-0 items-center gap-2 ${isActive ? '' : 'bg-white/65 hover:bg-white'} disabled:opacity-65`}
              >
                <span className="max-w-36 truncate text-left font-medium">{chat.title}</span>
                <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {chat.messageCount}
                </span>
              </PillButton>
            );
          })}

          <PillButton
            onClick={onCreateChat}
            disabled={!canManageChats}
            className="shrink-0 bg-white/70 hover:bg-white"
          >
            + New Chat
          </PillButton>
        </div>
      </div>

      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <p className="font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
            {activeChat?.title ?? 'Agent Channel'}
          </p>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {status}
          </p>
        </div>
        <PillButton
          onClick={onCancel}
          disabled={status === 'idle'}
          className="disabled:opacity-40"
        >
          Stop
        </PillButton>
      </header>

      <div className="flex items-center justify-end gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <PillButton
          size="sm"
          onClick={() => onDeleteChat(activeChatId)}
          disabled={chats.length <= 1 || !canManageChats}
          className="bg-white/70 hover:bg-white"
        >
          Delete Chat
        </PillButton>
        <PillButton
          size="sm"
          onClick={onClearChat}
          disabled={messages.length === 0 || status !== 'idle'}
          className="bg-white/70 hover:bg-white"
        >
          Clear Chat
        </PillButton>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)]/90 bg-[var(--color-surface-soft)]/80 p-4 text-sm text-[var(--color-text-muted)]">
            Ask a question, request a diagram, or include LaTeX like <code>\(\int_0^1 x^2 dx\)</code>.
          </div>
        ) : null}

        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <article
              key={message.id}
              className={`${newMessageIds.has(message.id) ? 'animate-rise-in' : ''} rounded-2xl border px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)] ${
                isUser
                  ? 'ml-6 border-[var(--color-accent-soft)] bg-[var(--color-accent-faint)]'
                  : 'mr-6 border-[var(--color-border)] bg-[var(--color-surface)]'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  {isUser ? 'You' : 'Agent'}
                </div>
                <PillButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${isUser ? 'user' : 'assistant'} message`}
                  onClick={() => onDeleteMessage(message.id)}
                  disabled={status !== 'idle'}
                  className="hover:bg-white/75 hover:text-[var(--color-text-secondary)] disabled:opacity-40"
                >
                  Delete
                </PillButton>
              </div>
              <MessageContent content={message.content} />
            </article>
          );
        })}

        {status === 'thinking' && (
          <div className="animate-rise-in mr-6 flex gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-soft)]/55 p-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Explain this concept and draw it out..."
          rows={3}
          disabled={disabled}
          className="w-full resize-none rounded-2xl border border-[var(--color-border)] bg-white/88 px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
        />

        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-[var(--color-text-muted)]">Enter to send · Shift+Enter newline · Ctrl+Shift+K focus</p>
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || input.trim().length === 0}
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_16px_rgba(10,132,255,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </footer>
    </section>
  );
}
