import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ChatPanel } from '@/components/chat/ChatPanel';

afterEach(cleanup);

function makeChats(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    title: `Chat ${i}`,
    messageCount: i,
  }));
}

const baseProps = {
  input: '',
  status: 'idle' as const,
  onInput: vi.fn(),
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onSelectChat: vi.fn(),
  onCreateChat: vi.fn(),
  onDeleteChat: vi.fn(),
  onDeleteMessage: vi.fn(),
  onClearChat: vi.fn(),
  disabled: false,
};

describe('ChatPanel accessibility', () => {
  it('textarea has aria-label "Message input"', () => {
    render(
      <ChatPanel chats={makeChats(1)} activeChatId="c0" messages={[]} {...baseProps} />,
    );
    const textarea = screen.getByLabelText('Message input');
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('message list has role="log" and aria-live="polite"', () => {
    render(
      <ChatPanel chats={makeChats(1)} activeChatId="c0" messages={[]} {...baseProps} />,
    );
    const log = screen.getByRole('log');
    expect(log).toBeTruthy();
    expect(log.getAttribute('aria-live')).toBe('polite');
  });

  it('chat tab container has role="tablist"', () => {
    render(
      <ChatPanel chats={makeChats(2)} activeChatId="c0" messages={[]} {...baseProps} />,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist.getAttribute('aria-label')).toBe('Chat threads');
  });

  it('each chat tab has role="tab" and descriptive aria-label', () => {
    render(
      <ChatPanel chats={makeChats(3)} activeChatId="c1" messages={[]} {...baseProps} />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute('aria-label')).toBe('Switch to chat: Chat 0');
    expect(tabs[1].getAttribute('aria-label')).toBe('Switch to chat: Chat 1');
    expect(tabs[2].getAttribute('aria-label')).toBe('Switch to chat: Chat 2');
  });

  it('active tab has aria-selected="true", others "false"', () => {
    render(
      <ChatPanel chats={makeChats(2)} activeChatId="c1" messages={[]} {...baseProps} />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('active tab has tabIndex=0, inactive tabs have tabIndex=-1', () => {
    render(
      <ChatPanel chats={makeChats(3)} activeChatId="c1" messages={[]} {...baseProps} />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].tabIndex).toBe(-1);
    expect(tabs[1].tabIndex).toBe(0);
    expect(tabs[2].tabIndex).toBe(-1);
  });

  it('delete message buttons have descriptive aria-labels', () => {
    const messages = [
      { id: 'm1', role: 'user' as const, content: 'Hello', createdAt: 1 },
      { id: 'm2', role: 'assistant' as const, content: 'Hi', createdAt: 2 },
    ];
    render(
      <ChatPanel chats={makeChats(1)} activeChatId="c0" messages={messages} {...baseProps} />,
    );
    expect(screen.getByLabelText('Delete user message')).toBeTruthy();
    expect(screen.getByLabelText('Delete assistant message')).toBeTruthy();
  });
});

describe('ChatPanel status announcements', () => {
  it('status element has role="status"', () => {
    render(
      <ChatPanel chats={makeChats(1)} activeChatId="c0" messages={[]} {...baseProps} status="idle" />,
    );
    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeTruthy();
    expect(statusEl.textContent).toBe('idle');
  });

  it('status text updates on re-render with new status', () => {
    const { rerender } = render(
      <ChatPanel chats={makeChats(1)} activeChatId="c0" messages={[]} {...baseProps} status="idle" />,
    );
    expect(screen.getByRole('status').textContent).toBe('idle');

    rerender(
      <ChatPanel chats={makeChats(1)} activeChatId="c0" messages={[]} {...baseProps} status="thinking" />,
    );
    expect(screen.getByRole('status').textContent).toBe('thinking');
  });

  it('each message is wrapped in an article element', () => {
    const messages = [
      { id: 'm1', role: 'user' as const, content: 'Hello', createdAt: 1 },
      { id: 'm2', role: 'assistant' as const, content: 'Hi', createdAt: 2 },
    ];
    render(
      <ChatPanel chats={makeChats(1)} activeChatId="c0" messages={messages} {...baseProps} />,
    );
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(2);
  });
});

describe('ChatPanel tab keyboard navigation', () => {
  it('ArrowRight moves to next tab', () => {
    const onSelectChat = vi.fn();
    render(
      <ChatPanel
        chats={makeChats(3)}
        activeChatId="c0"
        messages={[]}
        {...baseProps}
        onSelectChat={onSelectChat}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(onSelectChat).toHaveBeenCalledWith('c1');
  });

  it('ArrowLeft wraps from first to last tab', () => {
    const onSelectChat = vi.fn();
    render(
      <ChatPanel
        chats={makeChats(3)}
        activeChatId="c0"
        messages={[]}
        {...baseProps}
        onSelectChat={onSelectChat}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(onSelectChat).toHaveBeenCalledWith('c2');
  });

  it('Home key moves to first tab', () => {
    const onSelectChat = vi.fn();
    render(
      <ChatPanel
        chats={makeChats(3)}
        activeChatId="c2"
        messages={[]}
        {...baseProps}
        onSelectChat={onSelectChat}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(onSelectChat).toHaveBeenCalledWith('c0');
  });

  it('End key moves to last tab', () => {
    const onSelectChat = vi.fn();
    render(
      <ChatPanel
        chats={makeChats(3)}
        activeChatId="c0"
        messages={[]}
        {...baseProps}
        onSelectChat={onSelectChat}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(onSelectChat).toHaveBeenCalledWith('c2');
  });

  it('ArrowRight wraps from last to first tab', () => {
    const onSelectChat = vi.fn();
    render(
      <ChatPanel
        chats={makeChats(3)}
        activeChatId="c2"
        messages={[]}
        {...baseProps}
        onSelectChat={onSelectChat}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
    expect(onSelectChat).toHaveBeenCalledWith('c0');
  });
});
