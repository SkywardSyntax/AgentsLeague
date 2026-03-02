'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '@/types/agent';
import { downloadChatAsMarkdown, downloadChatAsJson } from '@/lib/client/export-chat';
import { MessageContent } from './MessageContent';
import { MessageSearch } from './MessageSearch';

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
}: ChatPanelProps) {
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const canManageChats = status === 'idle';
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const currentIndex = chats.findIndex((c) => c.id === activeChatId);
      if (currentIndex === -1) return;
      const nextIndex =
        e.key === 'ArrowRight'
          ? (currentIndex + 1) % chats.length
          : (currentIndex - 1 + chats.length) % chats.length;
      const nextChat = chats[nextIndex];
      if (nextChat && canManageChats) {
        onSelectChat(nextChat.id);
        // Focus the newly selected tab
        const tabs = tablistRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
        tabs?.[nextIndex]?.focus();
      }
    },
    [chats, activeChatId, canManageChats, onSelectChat],
  );

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.content.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const handleSearch = useCallback((query: string) => setSearchQuery(query), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' && (e.ctrlKey || e.metaKey) && e.target instanceof HTMLTextAreaElement === false) {
        e.preventDefault();
        setSearchVisible(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!showExportMenu) return;
    const close = (e: MouseEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('[data-export-menu]')) return;
      setShowExportMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showExportMenu]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    // Only auto-scroll if user is near the bottom (within 120px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <section
      aria-label="Chat"
      className="glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[var(--shadow-card)]"
    >
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <div className="scrollbar-thin flex items-center gap-2 overflow-x-auto pb-0.5">
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Chat threads"
            onKeyDown={handleTabKeyDown}
            className="flex items-center gap-2"
          >
            {chats.map((chat) => {
              const isActive = chat.id === activeChatId;
              return (
                <button
                  key={chat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="chat-messages-panel"
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => onSelectChat(chat.id)}
                  disabled={!canManageChats}
                  className={`group flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                    isActive
                      ? 'border-[var(--color-accent)]/45 bg-[var(--color-accent-faint)] text-[var(--color-text-primary)]'
                      : 'border-[var(--color-border)] bg-white/65 text-[var(--color-text-secondary)] hover:bg-white'
                  } disabled:cursor-not-allowed disabled:opacity-65`}
                >
                  <span className="max-w-36 truncate text-left font-medium">{chat.title}</span>
                  <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] tabular-nums">
                    {chat.messageCount}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onCreateChat}
            disabled={!canManageChats}
            className="shrink-0 rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            + New Chat
          </button>
        </div>
      </div>

      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <p className="font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
            {activeChat?.title ?? 'Agent Channel'}
          </p>
          <p
            role="status"
            aria-live="polite"
            className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]"
          >
            {status}
          </p>
        </div>
        <button
          type="button"
          aria-label="Stop generating"
          onClick={onCancel}
          disabled={status === 'idle'}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Stop
        </button>
      </header>

      <div className="flex items-center justify-end gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <div className="relative">
          <button
            type="button"
            aria-label="Export chat"
            onClick={() => setShowExportMenu((v) => !v)}
            disabled={messages.length === 0}
            className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Export
          </button>
          {showExportMenu && (
            <div data-export-menu className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-[var(--color-border)] bg-white shadow-md">
              <button
                type="button"
                onClick={() => { downloadChatAsMarkdown(messages, activeChat?.title ?? 'Chat', setExportError); setShowExportMenu(false); }}
                className="block w-full px-4 py-1.5 text-left text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]"
              >
                Export as MD
              </button>
              <button
                type="button"
                onClick={() => { if (activeChat) downloadChatAsJson(messages, activeChat, setExportError); setShowExportMenu(false); }}
                className="block w-full px-4 py-1.5 text-left text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]"
              >
                Export as JSON
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Delete current chat"
          onClick={() => onDeleteChat(activeChatId)}
          disabled={chats.length <= 1 || !canManageChats}
          className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          Delete Chat
        </button>
        <button
          type="button"
          aria-label="Clear chat messages"
          onClick={onClearChat}
          disabled={messages.length === 0 || status !== 'idle'}
          className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          Clear Chat
        </button>
      </div>

      <MessageSearch
        visible={searchVisible}
        onSearch={handleSearch}
        matchCount={searchQuery ? filteredMessages.length : 0}
        onClose={() => { setSearchVisible(false); setSearchQuery(''); }}
      />

      {exportError && (
        <div role="alert" className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {exportError}
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="ml-2 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        id="chat-messages-panel"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {filteredMessages.length === 0 && messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)]/90 bg-[var(--color-surface-soft)]/80 p-4 text-sm text-[var(--color-text-muted)]">
            Ask a question, request a diagram, or include LaTeX like <code>\(\int_0^1 x^2 dx\)</code>.
          </div>
        ) : null}

        {filteredMessages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <article
              key={message.id}
              id={`msg-${message.id}`}
              className={`animate-rise-in rounded-2xl border px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)] ${
                isUser
                  ? 'ml-6 border-[var(--color-accent-soft)] bg-[var(--color-accent-faint)]'
                  : 'mr-6 border-[var(--color-border)] bg-[var(--color-surface)]'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  {isUser ? 'You' : 'Agent'}
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${isUser ? 'user' : 'assistant'} message`}
                  aria-describedby={`msg-${message.id}`}
                  onClick={() => onDeleteMessage(message.id)}
                  disabled={status !== 'idle'}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)] transition hover:bg-white/75 hover:text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
              <MessageContent content={message.content} />
            </article>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-soft)]/55 p-3">
        <form
          aria-label="Send a message"
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
        >
          <textarea
            aria-label="Message input"
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
            <p className="text-[11px] text-[var(--color-text-muted)]">Enter to send · Shift+Enter newline</p>
            <button
              type="submit"
              disabled={disabled || input.trim().length === 0}
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_16px_rgba(10,132,255,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </footer>
    </section>
  );
}
