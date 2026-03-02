import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { WarningOverlay } from '@/components/app/WarningOverlay';

afterEach(cleanup);

describe('WarningOverlay keyboard dismiss', () => {
  it('Escape key calls the dismiss handler', () => {
    const onDismiss = vi.fn();
    render(<WarningOverlay warnings={['Test warning']} onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not fire dismiss when no warnings are displayed', () => {
    const onDismiss = vi.fn();
    render(<WarningOverlay warnings={[]} onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('close button has aria-label="Dismiss warning"', () => {
    const onDismiss = vi.fn();
    render(<WarningOverlay warnings={['Test warning']} onDismiss={onDismiss} />);

    const closeBtn = screen.getByRole('button', { name: 'Dismiss warning' });
    expect(closeBtn).toBeTruthy();
  });

  it('close button calls onDismiss when clicked', () => {
    const onDismiss = vi.fn();
    render(<WarningOverlay warnings={['Test warning']} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('no close button rendered when onDismiss is not provided', () => {
    render(<WarningOverlay warnings={['Test warning']} />);

    expect(screen.queryByRole('button', { name: 'Dismiss warning' })).toBeNull();
  });

  it('preserves existing role="status" and aria-live="polite"', () => {
    render(<WarningOverlay warnings={['Test warning']} onDismiss={vi.fn()} />);

    const container = screen.getByRole('status');
    expect(container.getAttribute('aria-live')).toBe('polite');
    expect(container.getAttribute('aria-label')).toBe('Warnings');
  });
});
