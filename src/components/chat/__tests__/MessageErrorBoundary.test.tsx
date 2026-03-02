import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MessageErrorBoundary } from '@/components/chat/MessageErrorBoundary';

function ThrowingChild(): React.ReactNode {
  throw new Error('render explosion');
}

describe('MessageErrorBoundary', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders fallback text when a child throws during render', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <MessageErrorBoundary fallbackText="Something went wrong">
        <ThrowingChild />
      </MessageErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(spy).toHaveBeenCalledWith(
      '[MessageErrorBoundary]',
      'render explosion',
      expect.any(String),
    );

    spy.mockRestore();
  });

  it('renders children normally when no error occurs', () => {
    render(
      <MessageErrorBoundary fallbackText="fallback">
        <span>healthy child</span>
      </MessageErrorBoundary>,
    );

    expect(screen.getByText('healthy child')).toBeTruthy();
    expect(screen.queryByText('fallback')).toBeNull();
  });
});
