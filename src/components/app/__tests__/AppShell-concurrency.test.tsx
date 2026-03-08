import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatPanel } from '@/components/chat/ChatPanel';
import type { ChatMessage } from '@/types/agent';

function renderChatPanel(overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) {
  const defaults: Parameters<typeof ChatPanel>[0] = {
    chats: [{ id: 'c1', title: 'Chat 1', messageCount: 0 }],
    activeChatId: 'c1',
    messages: [] as ChatMessage[],
    input: '',
    status: 'idle',
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

  const props = { ...defaults, ...overrides };
  return { ...render(<ChatPanel {...props} />), props };
}

describe('ChatPanel concurrency guards', () => {
  afterEach(cleanup);

  beforeEach(() => {
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });
  it('Send button is disabled when disabled prop is true (status !== idle)', () => {
    const onSend = vi.fn();
    renderChatPanel({ status: 'thinking', disabled: true, input: 'hello', onSend });

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toHaveAttribute('aria-disabled', 'true');

    sendButton.click();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Send button is disabled when input is empty', () => {
    const onSend = vi.fn();
    renderChatPanel({ status: 'idle', disabled: false, input: '', onSend });

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toHaveAttribute('aria-disabled', 'true');
  });

  it('Send button enabled when idle + non-empty input; onSend called once', () => {
    const onSend = vi.fn();
    renderChatPanel({ status: 'idle', disabled: false, input: 'hello', onSend });

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(sendButton);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('Stop button is disabled when status is idle', () => {
    const onCancel = vi.fn();
    renderChatPanel({ status: 'idle', onCancel });

    const stopButton = screen.getByRole('button', { name: 'Stop' });
    expect(stopButton).toHaveAttribute('aria-disabled', 'true');

    stopButton.click();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
