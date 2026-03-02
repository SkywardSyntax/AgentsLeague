import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';

afterEach(cleanup);

function ProblemChild(): React.ReactNode {
  throw new Error('Test explosion');
}

function GoodChild() {
  return <div>All is well</div>;
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
});
