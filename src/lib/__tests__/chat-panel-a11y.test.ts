import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatPanel, type ChatThreadMeta } from '@/components/chat/ChatPanel';

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

const chats: ChatThreadMeta[] = [
  { id: 'c1', title: 'Chat One', messageCount: 3 },
  { id: 'c2', title: 'Chat Two', messageCount: 1 },
  { id: 'c3', title: 'Chat Three', messageCount: 0 },
];

const messages = [
  { id: 'm1', role: 'user' as const, content: 'Hello', createdAt: 1000 },
  { id: 'm2', role: 'assistant' as const, content: 'World', createdAt: 2000 },
];

const noop = () => {};

function renderPanel(overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {}) {
  return render(
    React.createElement(ChatPanel, {
      chats,
      activeChatId: 'c1',
      messages,
      input: '',
      status: 'idle',
      onInput: noop,
      onSend: noop,
      onCancel: noop,
      onSelectChat: noop,
      onCreateChat: noop,
      onDeleteChat: noop,
      onDeleteMessage: noop,
      onClearChat: noop,
      disabled: false,
      ...overrides,
    }),
  );
}

describe('ChatPanel ARIA tabs', () => {
  it('renders a tablist with role="tablist"', () => {
    renderPanel();
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();
    expect(tablist.getAttribute('aria-label')).toBe('Chat threads');
  });

  it('renders tabs with role="tab" and aria-selected', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false');
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('false');
  });

  it('active tab has tabIndex=0, others have tabIndex=-1', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.tabIndex).toBe(0);
    expect(tabs[1]!.tabIndex).toBe(-1);
    expect(tabs[2]!.tabIndex).toBe(-1);
  });

  it('tabs reference the messages panel via aria-controls', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab');
    for (const tab of tabs) {
      expect(tab.getAttribute('aria-controls')).toBe('chat-messages-panel');
    }
    const panel = document.getElementById('chat-messages-panel');
    expect(panel).not.toBeNull();
  });

  it('arrow keys navigate between tabs', () => {
    const onSelectChat = vi.fn();
    renderPanel({ onSelectChat });
    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onSelectChat).toHaveBeenCalledWith('c2');
  });

  it('active tab is not disabled (per WAI-ARIA pattern)', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.hasAttribute('disabled')).toBe(false);
  });
});

describe('ChatPanel message a11y', () => {
  it('message articles have id attributes', () => {
    renderPanel();
    expect(document.getElementById('msg-m1')).not.toBeNull();
    expect(document.getElementById('msg-m2')).not.toBeNull();
  });

  it('delete buttons have aria-describedby pointing to the message', () => {
    renderPanel();
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    const msgDeleteButtons = deleteButtons.filter((b) => b.getAttribute('aria-describedby'));
    expect(msgDeleteButtons).toHaveLength(2);
    expect(msgDeleteButtons[0]!.getAttribute('aria-describedby')).toBe('msg-m1');
    expect(msgDeleteButtons[1]!.getAttribute('aria-describedby')).toBe('msg-m2');
  });
});

describe('ChatPanel status announcements', () => {
  it('status indicator has aria-live="polite"', () => {
    renderPanel({ status: 'thinking' });
    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeDefined();
    expect(statusEl.getAttribute('aria-live')).toBe('polite');
    expect(statusEl.textContent).toBe('thinking');
  });
});

describe('ChatPanel export error feedback', () => {
  it('export buttons are disabled when messages is empty', () => {
    renderPanel({ messages: [] });
    const exportBtn = screen.getByRole('button', { name: 'Export chat' });
    expect(exportBtn.hasAttribute('disabled')).toBe(true);
  });
});
