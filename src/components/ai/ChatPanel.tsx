'use client';

import { useState } from 'react';

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside
      className={`fixed right-0 top-0 z-40 flex h-full w-full flex-col bg-[var(--color-surface)] shadow-lg transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] sm:w-80 md:w-96 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-label="AI Chat panel"
      role="complementary"
    >
      {/* ChatHeader */}
      <div className="flex h-15 items-center justify-between border-b border-[var(--color-border)] px-3 sm:px-4">
        <h2 className="text-sm font-semibold sm:text-base">Chat</h2>
        <button
          onClick={() => setIsOpen(false)}
          className="min-h-[44px] min-w-[44px] rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
          aria-label="Close chat panel"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* MessageList */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4" role="log" aria-label="Chat messages">
        {/* Messages will be rendered here via virtualized list */}
      </div>

      {/* ChatInput */}
      <div className="border-t border-[var(--color-border)] p-3 sm:p-4">
        <label htmlFor="ai-chat-input" className="sr-only">
          Ask AI to draw something
        </label>
        <textarea
          id="ai-chat-input"
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm outline-none focus:border-[var(--color-blue)] min-h-[44px]"
          placeholder="Ask AI to draw something..."
          rows={3}
          aria-label="AI prompt input"
        />
      </div>
    </aside>
  );
}
