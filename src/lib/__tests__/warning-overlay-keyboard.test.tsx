import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { WarningOverlay, type NotificationItem } from '@/components/app/WarningOverlay';

function makeNotification(message: string, severity: NotificationItem['severity'] = 'warning'): NotificationItem {
  return { id: `test-${message}`, message, severity };
}

afterEach(cleanup);

describe('WarningOverlay keyboard dismiss', () => {
  it('Escape key calls the dismiss handler', () => {
    const onDismissAll = vi.fn();
    render(<WarningOverlay notifications={[makeNotification('Test warning')]} onDismissAll={onDismissAll} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismissAll).toHaveBeenCalledOnce();
  });

  it('does not fire dismiss when no notifications are displayed', () => {
    const onDismissAll = vi.fn();
    render(<WarningOverlay notifications={[]} onDismissAll={onDismissAll} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismissAll).not.toHaveBeenCalled();
  });

  it('each notification has a dismiss button', () => {
    const onDismissOne = vi.fn();
    render(<WarningOverlay notifications={[makeNotification('Test warning')]} onDismissOne={onDismissOne} />);

    const closeBtn = screen.getByRole('button', { name: 'Dismiss warning' });
    expect(closeBtn).toBeTruthy();
  });

  it('dismiss button calls onDismissOne when clicked', () => {
    const onDismissOne = vi.fn();
    render(<WarningOverlay notifications={[makeNotification('Test warning')]} onDismissOne={onDismissOne} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(onDismissOne).toHaveBeenCalledOnce();
  });

  it('renders dismiss buttons even without onDismissAll', () => {
    render(<WarningOverlay notifications={[makeNotification('Test warning')]} />);

    expect(screen.getByRole('button', { name: 'Dismiss warning' })).toBeTruthy();
  });

  it('preserves existing role="status" and aria-live="polite"', () => {
    render(<WarningOverlay notifications={[makeNotification('Test warning')]} onDismissAll={vi.fn()} />);

    const container = screen.getByRole('status');
    expect(container.getAttribute('aria-live')).toBe('polite');
    expect(container.getAttribute('aria-label')).toBe('Notifications');
  });
});
