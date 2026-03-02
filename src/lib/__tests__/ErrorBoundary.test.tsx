import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';

afterEach(cleanup);

function ProblemChild(): React.ReactNode {
  throw new Error('Test explosion');
}

function GoodChild() {
  return <div>All is well</div>;
}

/** Throws on first render, succeeds after reset */
function ToggleChild({ shouldThrow }: { shouldThrow: boolean }): React.ReactNode {
  if (shouldThrow) throw new Error('Transient error');
  return <div>Recovered</div>;
}

function RetryHarness() {
  const [fail, setFail] = useState(true);
  return (
    <ErrorBoundary onRetry={() => setFail(false)}>
      <ToggleChild shouldThrow={fail} />
    </ErrorBoundary>
  );
}

describe('ErrorBoundary', () => {
  it('renders fallback UI with role="alert" when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Test explosion')).toBeTruthy();
  });

  it('Reload button is keyboard-focusable and has accessible name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );

    const reloadBtn = screen.getByRole('button', { name: 'Reload' });
    expect(reloadBtn).toBeTruthy();
    expect(reloadBtn.getAttribute('type')).toBe('button');
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText('All is well')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Try Again resets the error boundary and re-renders child', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<RetryHarness />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Recovered')).toBeTruthy();
  });

  it('auto-focuses the primary action button when error is caught', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary onRetry={() => {}}>
        <ProblemChild />
      </ErrorBoundary>,
    );

    const tryAgainBtn = screen.getByRole('button', { name: 'Try Again' });
    expect(document.activeElement).toBe(tryAgainBtn);
  });

  it('auto-focuses the Reload button when no onRetry is provided', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );

    const reloadBtn = screen.getByRole('button', { name: 'Reload' });
    expect(document.activeElement).toBe(reloadBtn);
  });

  it('has aria-label on details element and role="log" on pre', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );

    const details = screen.getByRole('alert').querySelector('details');
    expect(details?.getAttribute('aria-label')).toBe('Error details');

    const pre = screen.getByRole('log');
    expect(pre).toBeTruthy();
    expect(pre.textContent).toBe('Test explosion');
  });
});
