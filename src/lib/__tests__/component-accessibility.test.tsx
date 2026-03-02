import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ChatPanel } from '@/components/chat/ChatPanel';

afterEach(cleanup);

describe('accessibility annotations', () => {
  it('StatusBadge has role="status" and aria-live="polite"', () => {
    render(<StatusBadge status="idle" />);
    const badge = screen.getByRole('status');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('aria-live')).toBe('polite');
  });

  it('StatusBadge updates role=status content when status changes', () => {
    const { rerender } = render(<StatusBadge status="idle" />);
    expect(screen.getByRole('status').textContent).toContain('Ready');

    rerender(<StatusBadge status="thinking" />);
    expect(screen.getByRole('status').textContent).toContain('Thinking');
  });

  it('ChatPanel active tab has aria-current="true"', () => {
    const chats = [
      { id: 'a', title: 'Chat A', messageCount: 0 },
      { id: 'b', title: 'Chat B', messageCount: 2 },
    ];

    render(
      <ChatPanel
        chats={chats}
        activeChatId="a"
        messages={[]}
        input=""
        status="idle"
        onInput={vi.fn()}
        onSend={vi.fn()}
        onCancel={vi.fn()}
        onSelectChat={vi.fn()}
        onCreateChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onDeleteMessage={vi.fn()}
        onClearChat={vi.fn()}
        disabled={false}
      />,
    );

    // Find buttons that contain the chat titles
    const buttons = screen.getAllByRole('button');
    const chatABtn = buttons.find((b) => b.textContent?.includes('Chat A'));
    const chatBBtn = buttons.find((b) => b.textContent?.includes('Chat B'));

    expect(chatABtn).toBeTruthy();
    expect(chatBBtn).toBeTruthy();
    expect(chatABtn!.getAttribute('aria-current')).toBe('true');
    expect(chatBBtn!.hasAttribute('aria-current')).toBe(false);
  });
});
