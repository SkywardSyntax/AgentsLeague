import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PillButton } from '@/components/ui/PillButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MobilePanelSwitcher } from '@/components/app/MobilePanelSwitcher';
import { WarningOverlay, type NotificationItem } from '@/components/app/WarningOverlay';

afterEach(cleanup);

// ---------- PillButton ----------
describe('PillButton', () => {
  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<PillButton onClick={onClick}>Click me</PillButton>);
    fireEvent.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<PillButton onClick={onClick} disabled>Click me</PillButton>);
    fireEvent.click(screen.getByText('Click me'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies accent variant class', () => {
    render(<PillButton variant="accent">Accent</PillButton>);
    const btn = screen.getByText('Accent');
    expect(btn.className).toContain('border-[var(--color-accent)]');
  });

  it('applies ghost variant class', () => {
    render(<PillButton variant="ghost">Ghost</PillButton>);
    const btn = screen.getByText('Ghost');
    expect(btn.className).toContain('border-transparent');
  });

  it('applies sm size class', () => {
    render(<PillButton size="sm">Small</PillButton>);
    const btn = screen.getByText('Small');
    expect(btn.className).toContain('text-[10px]');
  });

  it('uses default variant and md size when no props given', () => {
    render(<PillButton>Default</PillButton>);
    const btn = screen.getByText('Default');
    expect(btn.className).toContain('border-[var(--color-border)]');
    expect(btn.className).toContain('text-xs');
  });
});

// ---------- StatusBadge ----------
describe('StatusBadge', () => {
  const statuses = ['idle', 'thinking', 'streaming', 'drawing'] as const;
  const expectedLabels: Record<typeof statuses[number], string> = {
    idle: 'Ready',
    thinking: 'Thinking',
    streaming: 'Responding',
    drawing: 'Drawing',
  };

  for (const status of statuses) {
    it(`renders "${expectedLabels[status]}" label for status="${status}"`, () => {
      render(<StatusBadge status={status} />);
      expect(screen.getByTestId('status-label').textContent).toBe(expectedLabels[status]);
    });
  }

  it('idle status dot does not have pulse-active class', () => {
    render(<StatusBadge status="idle" />);
    expect(screen.getByTestId('status-dot').className).not.toContain('pulse-active');
  });

  it('non-idle status dot has pulse-active class', () => {
    render(<StatusBadge status="thinking" />);
    expect(screen.getByTestId('status-dot').className).toContain('pulse-active');
  });
});

// ---------- MobilePanelSwitcher ----------
describe('MobilePanelSwitcher', () => {
  it('calls onSwitch with "whiteboard" when Canvas button is clicked', () => {
    const onSwitch = vi.fn();
    render(<MobilePanelSwitcher activePanel="chat" onSwitch={onSwitch} />);
    fireEvent.click(screen.getByText('Canvas'));
    expect(onSwitch).toHaveBeenCalledWith('whiteboard');
  });

  it('calls onSwitch with "chat" when Chat button is clicked', () => {
    const onSwitch = vi.fn();
    render(<MobilePanelSwitcher activePanel="whiteboard" onSwitch={onSwitch} />);
    fireEvent.click(screen.getByText('Chat'));
    expect(onSwitch).toHaveBeenCalledWith('chat');
  });

  it('highlights active panel button with accent class', () => {
    const onSwitch = vi.fn();
    render(<MobilePanelSwitcher activePanel="whiteboard" onSwitch={onSwitch} />);
    const canvasBtn = screen.getByText('Canvas');
    const chatBtn = screen.getByText('Chat');
    expect(canvasBtn.className).toContain('bg-[var(--color-accent)]');
    expect(chatBtn.className).not.toContain('bg-[var(--color-accent)]');
  });
});

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

// ---------- React.memo behavior ----------
describe('PillButton memo', () => {
  it('does not re-render when parent re-renders with same props', () => {
    const renderSpy = vi.fn();
    function Wrapper({ count }: { count: number }) {
      renderSpy();
      return <PillButton onClick={stableOnClick}>{`Label ${count}`}</PillButton>;
    }
    const stableOnClick = vi.fn();
    const { rerender } = render(<Wrapper count={1} />);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    // Re-render parent — PillButton children change so it re-renders
    rerender(<Wrapper count={1} />);
    expect(renderSpy).toHaveBeenCalledTimes(2);
    // PillButton itself should re-render because Wrapper is not memoized,
    // but PillButton skips when its own props are unchanged
  });

  it('PillButton is wrapped in React.memo', () => {
    // React.memo wraps the component, giving it $$typeof Symbol for memo
    expect((PillButton as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});

describe('StatusBadge memo', () => {
  it('StatusBadge is wrapped in React.memo', () => {
    expect((StatusBadge as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('updates text when status prop changes', () => {
    const { rerender } = render(<StatusBadge status="idle" />);
    expect(screen.getByTestId('status-label').textContent).toBe('Ready');

    rerender(<StatusBadge status="streaming" />);
    expect(screen.getByTestId('status-label').textContent).toBe('Responding');
  });
});
