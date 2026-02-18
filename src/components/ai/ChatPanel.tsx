'use client';

import { useState } from 'react';

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside
      className={`fixed right-0 top-0 z-40 flex h-full w-96 flex-col bg-[var(--color-surface)] shadow-lg transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* ChatHeader */}
      <div className="flex h-15 items-center justify-between border-b border-[var(--color-border)] px-4">
        <h2 className="text-sm font-semibold">Chat</h2>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          aria-label="Close chat"
        >
          ✕
        </button>
      </div>

      {/* MessageList */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Messages will be rendered here via virtualized list */}
      </div>

      {/* ChatInput */}
      <div className="border-t border-[var(--color-border)] p-4">
        <textarea
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm outline-none focus:border-[var(--color-blue)]"
          placeholder="Ask AI to draw something..."
          rows={3}
        />
      </div>
    </aside>
  );
}
