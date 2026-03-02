import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChatPanel } from '@/components/chat/ChatPanel';

afterEach(cleanup);

const defaultProps = {
  chats: [{ id: 'c1', title: 'Chat 1', messageCount: 2 }],
  activeChatId: 'c1',
  messages: [
    { id: 'm1', role: 'user' as const, content: 'Hello', createdAt: 1 },
    { id: 'm2', role: 'assistant' as const, content: 'Hi', createdAt: 2 },
  ],
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
  it('every button has either visible text content or an aria-label', () => {
    render(<ChatPanel {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    for (const button of buttons) {
      const hasAriaLabel = button.hasAttribute('aria-label');
      const hasTextContent = (button.textContent ?? '').trim().length > 0;
      expect(hasAriaLabel || hasTextContent).toBe(true);
    }
  });

  it('has aria-label on New Chat button', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'New chat' })).toBeDefined();
  });

  it('has aria-label on Stop generation button', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Stop generation' })).toBeDefined();
  });

  it('has aria-label on Delete current chat button', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Delete current chat' })).toBeDefined();
  });

  it('has aria-label on Clear messages button', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Clear messages' })).toBeDefined();
  });

  it('has aria-label on Send message button', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDefined();
  });

  it('has role="status" on the streaming status indicator', () => {
    render(<ChatPanel {...defaultProps} status="streaming" />);
    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeDefined();
    expect(statusEl.textContent).toBe('streaming');
  });

  it('status element has aria-live="polite"', () => {
    render(<ChatPanel {...defaultProps} />);
    const statusEl = screen.getByRole('status');
    expect(statusEl.getAttribute('aria-live')).toBe('polite');
  });
});
