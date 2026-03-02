'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '@/types/agent';
import { downloadChatAsMarkdown, downloadChatAsJson } from '@/lib/client/export-chat';
import { MessageContent } from './MessageContent';
import { StreamProgress, type StreamPhase } from './StreamProgress';
import { MessageErrorBoundary } from './MessageErrorBoundary';
import { MessageSearch } from './MessageSearch';
import { PillButton } from '@/components/ui/PillButton';

function useTabKeyboard(chats: ChatThreadMeta[], onSelectChat: (id: string) => void) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      const idx = chats.findIndex(
        (c) => target.textContent?.includes(c.title),
      );
      if (idx === -1) return;
      let next = -1;
      if (e.key === 'ArrowRight') next = (idx + 1) % chats.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + chats.length) % chats.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = chats.length - 1;
      if (next >= 0) {
        e.preventDefault();
        onSelectChat(chats[next].id);
        const container = e.currentTarget;
        const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
        tabs[next]?.focus();
      }
    },
    [chats, onSelectChat],
  );
}

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
  streamPhase?: StreamPhase;
  retryAttempt?: number;
  maxRetries?: number;
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

export const ChatPanel = memo(function ChatPanel({
  chats,
  activeChatId,
  messages,
  input,
  status,
  streamPhase,
  retryAttempt,
  maxRetries,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const handleSelectChat = useCallback((id: string) => onSelectChat(id), [onSelectChat]);

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
        <div
            ref={tablistRef}
            role="tablist"
            aria-label="Chat threads"
            onKeyDown={handleTabKeyDown}
            className="scrollbar-thin flex items-center gap-2 overflow-x-auto pb-0.5"
          >
          {chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <PillButton
                key={chat.id}
                role="tab"
                aria-selected={isActive}
                aria-label={`Switch to chat: ${chat.title}`}
                variant={isActive ? 'accent' : 'default'}
                onClick={() => handleSelectChat(chat.id)}
                disabled={!canManageChats || isActive}
                tabIndex={isActive ? 0 : -1}
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
          <p
            role="status"
            aria-live="polite"
            className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]"
          >
            {status}
          </p>
        </div>
        <PillButton
          data-testid="chat-stop"
          onClick={onCancel}
          disabled={status === 'idle'}
          className="disabled:opacity-40"
        >
          Stop
        </PillButton>
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

      {status !== 'idle' && streamPhase && (
        <StreamProgress phase={streamPhase} retryAttempt={retryAttempt} maxRetries={maxRetries} />
      )}

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
        data-testid="chat-messages"
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
              data-testid={`chat-message-${isUser ? 'user' : 'assistant'}`}
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
                  aria-describedby={`msg-${message.id}`}
                  onClick={() => onDeleteMessage(message.id)}
                  disabled={status !== 'idle'}
                  className="hover:bg-white/75 hover:text-[var(--color-text-secondary)] disabled:opacity-40"
                >
                  Delete
                </PillButton>
              </div>
              <MessageErrorBoundary fallbackText={message.content.slice(0, 120)}>
                <MessageContent content={message.content} />
              </MessageErrorBoundary>
            </article>
          );
        })}
        <div ref={messagesEndRef} />

        {status === 'thinking' && (
          <div className="animate-rise-in mr-6 flex gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
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
            data-testid="chat-input"
            ref={inputRef}
            aria-label="Message input"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            maxLength={8000}
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
              type="submit"
              data-testid="chat-send"
              disabled={disabled || input.trim().length === 0}
              aria-label="Send message"
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_16px_rgba(10,132,255,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </footer>
    </section>
  );
});
