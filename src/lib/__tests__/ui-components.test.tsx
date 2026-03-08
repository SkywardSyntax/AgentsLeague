/**
 * UI component tests — updated for the Dark Atelier design system rebuild.
 * PillButton → Button, StatusBadge → Badge (new component APIs).
 * TODO: Update these tests once agent-146 finishes building the new components.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WarningOverlay, type NotificationItem } from '@/components/app/WarningOverlay';

afterEach(cleanup);

// ---------- WarningOverlay ----------
function makeNotification(message: string): NotificationItem {
  return { id: `test-${message}`, message, severity: 'warning' };
}

describe('WarningOverlay', () => {
  it('renders nothing when notifications is empty', () => {
    const { container } = render(<WarningOverlay notifications={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders all notifications when non-empty', () => {
    const notifications = ['Warning 1', 'Warning 2', 'Warning 3'].map(makeNotification);
    render(<WarningOverlay notifications={notifications} />);
    for (const n of notifications) {
      expect(screen.getByText(n.message)).toBeTruthy();
    }
  });

  it('renders notifications in order', () => {
    const notifications = ['First', 'Second', 'Third'].map(makeNotification);
    render(<WarningOverlay notifications={notifications} />);
    const paragraphs = screen.getAllByText(/First|Second|Third/);
    expect(paragraphs[0].textContent).toBe('First');
    expect(paragraphs[1].textContent).toBe('Second');
    expect(paragraphs[2].textContent).toBe('Third');
  });

  it('handles single notification', () => {
    render(<WarningOverlay notifications={[makeNotification('Only one')]} />);
    expect(screen.getByText('Only one')).toBeTruthy();
  });
});

// ---------- TODO: Button (replaces PillButton) ----------
// These tests should be rewritten against the new Button component
// from src/components/ui/Button.tsx once created by the UI rebuild.
describe.todo('Button (new design system)');

// ---------- TODO: Badge (replaces StatusBadge) ----------
// These tests should be rewritten against the new Badge component
// from src/components/ui/Badge.tsx once created by the UI rebuild.
describe.todo('Badge (new design system)');

// ---------- TODO: Mobile nav (replaces MobilePanelSwitcher) ----------
// Mobile panel switching is now part of AppShell's bottom nav.
describe.todo('Mobile panel nav (new design system)');
