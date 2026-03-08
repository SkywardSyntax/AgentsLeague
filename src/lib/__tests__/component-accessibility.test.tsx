import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { WarningOverlay, type NotificationItem } from '@/components/app/WarningOverlay';

afterEach(cleanup);

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

describe('accessibility annotations', () => {
  // StatusBadge replaced by Badge in new design system — tests in ui-components.test.tsx
  it.todo('Badge (new) has role="status" and aria-live (replaces StatusBadge)');

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
    const notification: NotificationItem = { id: 'test-1', message: 'Test warning', severity: 'warning' };
    render(<WarningOverlay notifications={[notification]} />);
    const container = screen.getByRole('status', { name: 'Notifications' });
    expect(container).toBeTruthy();
    expect(container.getAttribute('aria-live')).toBe('polite');
    expect(container.getAttribute('aria-label')).toBe('Notifications');
  });

  it('WarningOverlay renders nothing when no notifications', () => {
    const { container } = render(<WarningOverlay notifications={[]} />);
    expect(container.innerHTML).toBe('');
  });

  // StatusBadge replaced by Badge in new design system — tests in ui-components.test.tsx
  it.todo('Badge (new) has role="status" and aria-live (replaces StatusBadge)');

  // MobilePanelSwitcher replaced by AppShell bottom nav — tests in mobile-panel-switcher.test.tsx
  it.todo('AppShell bottom nav has role="tablist" (replaces MobilePanelSwitcher)');
});
