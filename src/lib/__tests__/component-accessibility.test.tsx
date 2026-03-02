import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { WarningOverlay } from '@/components/app/WarningOverlay';
import { MobilePanelSwitcher } from '@/components/app/MobilePanelSwitcher';

afterEach(cleanup);

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

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

  it('ChatPanel tabs have role="tab" and aria-selected on active', () => {
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

    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeTruthy();
    expect(tablist.getAttribute('aria-label')).toBe('Chat threads');

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);

    const chatATab = tabs.find((t) => t.getAttribute('aria-label')?.includes('Chat A'));
    const chatBTab = tabs.find((t) => t.getAttribute('aria-label')?.includes('Chat B'));

    expect(chatATab).toBeTruthy();
    expect(chatBTab).toBeTruthy();
    expect(chatATab!.getAttribute('aria-selected')).toBe('true');
    expect(chatBTab!.getAttribute('aria-selected')).toBe('false');
  });

  it('WarningOverlay has role="status" and aria-live="polite"', () => {
    render(<WarningOverlay warnings={['Test warning']} />);
    const container = screen.getByRole('status');
    expect(container).toBeTruthy();
    expect(container.getAttribute('aria-live')).toBe('polite');
    expect(container.getAttribute('aria-label')).toBe('Warnings');
  });

  it('WarningOverlay renders nothing when no warnings', () => {
    const { container } = render(<WarningOverlay warnings={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('MobilePanelSwitcher has role="tablist"', () => {
    render(<MobilePanelSwitcher activePanel="chat" onSwitch={vi.fn()} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeTruthy();
    expect(tablist.getAttribute('aria-label')).toBe('Panel switcher');
  });

  it('MobilePanelSwitcher active tab has aria-selected="true"', () => {
    render(<MobilePanelSwitcher activePanel="chat" onSwitch={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    const canvasTab = tabs.find((t) => t.textContent === 'Canvas');
    const chatTab = tabs.find((t) => t.textContent === 'Chat');
    expect(canvasTab!.getAttribute('aria-selected')).toBe('false');
    expect(chatTab!.getAttribute('aria-selected')).toBe('true');
  });
});
