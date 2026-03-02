import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatPanel, type ChatThreadMeta } from '@/components/chat/ChatPanel';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

const chats: ChatThreadMeta[] = [
  { id: 'c1', title: 'Chat One', messageCount: 2 },
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

describe('ChatPanel export menu outside click', () => {
  it('opens the export menu on button click', () => {
    renderPanel();
    const exportBtn = screen.getByRole('button', { name: 'Export chat' });
    fireEvent.click(exportBtn);
    expect(screen.getByText('Export as MD')).toBeDefined();
    expect(screen.getByText('Export as JSON')).toBeDefined();
  });

  it('closes the export menu when clicking outside', () => {
    renderPanel();
    const exportBtn = screen.getByRole('button', { name: 'Export chat' });
    fireEvent.click(exportBtn);
    expect(screen.getByText('Export as MD')).toBeDefined();

    // Click outside the export menu using fireEvent on body
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Export as MD')).toBeNull();
  });

  it('does not close the export menu when clicking inside it', () => {
    renderPanel();
    const exportBtn = screen.getByRole('button', { name: 'Export chat' });
    fireEvent.click(exportBtn);
    const menuItem = screen.getByText('Export as MD');
    expect(menuItem).toBeDefined();

    // Click inside the export menu container
    const menuContainer = menuItem.closest('[data-export-menu]')!;
    fireEvent.mouseDown(menuContainer);

    // Menu should still be visible
    expect(screen.queryByText('Export as JSON')).not.toBeNull();
  });
});
