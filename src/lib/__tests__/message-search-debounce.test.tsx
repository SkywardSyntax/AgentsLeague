import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MessageSearch } from '@/components/chat/MessageSearch';

describe('MessageSearch debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('debounces onSearch — 10 rapid keystrokes trigger onSearch once after 200ms', () => {
    const onSearch = vi.fn();

    render(
      <MessageSearch onSearch={onSearch} matchCount={0} visible={true} onClose={() => {}} />,
    );

    const input = screen.getByRole('searchbox');

    // Simulate 10 rapid keystrokes
    for (let i = 1; i <= 10; i++) {
      fireEvent.change(input, { target: { value: 'abcdefghij'.slice(0, i) } });
    }

    // Before debounce fires, onSearch should not have been called
    expect(onSearch).not.toHaveBeenCalled();

    // Advance past 200ms debounce
    vi.advanceTimersByTime(250);

    // Should have been called exactly once with the final value
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('abcdefghij');
  });

  it('fires onSearch immediately on close (no debounce wait)', () => {
    const onSearch = vi.fn();
    const onClose = vi.fn();

    render(
      <MessageSearch onSearch={onSearch} matchCount={0} visible={true} onClose={onClose} />,
    );

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'test' } });

    // onSearch hasn't fired yet (debounced)
    expect(onSearch).not.toHaveBeenCalled();

    const closeBtn = screen.getByLabelText('Close search');
    fireEvent.click(closeBtn);

    // Close should immediately call onSearch('') without waiting for debounce
    expect(onSearch).toHaveBeenCalledWith('');
    expect(onClose).toHaveBeenCalled();
  });

  it('resets debounce timer on each keystroke', () => {
    const onSearch = vi.fn();

    render(
      <MessageSearch onSearch={onSearch} matchCount={0} visible={true} onClose={() => {}} />,
    );

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'a' } });

    // Advance 150ms (not enough to trigger)
    vi.advanceTimersByTime(150);
    expect(onSearch).not.toHaveBeenCalled();

    // Type again — resets the timer
    fireEvent.change(input, { target: { value: 'ab' } });

    // Another 150ms — still not enough since timer was reset
    vi.advanceTimersByTime(150);
    expect(onSearch).not.toHaveBeenCalled();

    // Another 100ms (total 250ms from last keystroke) — now fires
    vi.advanceTimersByTime(100);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('ab');
  });
});
