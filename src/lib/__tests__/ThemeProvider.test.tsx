import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/components/app/ThemeProvider';

const STORAGE_KEY = 'agentsleague:theme';

// Node 21+ built-in localStorage lacks Web Storage API methods; provide a mock
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _store: () => store,
    _reset: () => { store = {}; },
  };
})();

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button data-testid="toggle" onClick={toggleTheme}>Toggle</button>
    </div>
  );
}

beforeEach(() => {
  storageMock._reset();
  storageMock.getItem.mockReset().mockImplementation((key: string) => storageMock._store()[key] ?? null);
  storageMock.setItem.mockReset().mockImplementation((key: string, value: string) => { storageMock._store()[key] = value; });
  Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true, configurable: true });
  document.documentElement.removeAttribute('data-theme');
});

afterEach(cleanup);

describe('ThemeProvider', () => {
  it('defaults to system dark preference when matchMedia prefers dark', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider><ThemeConsumer /></ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    window.matchMedia = original;
  });

  it('defaults to light when matchMedia prefers light', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider><ThemeConsumer /></ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');

    window.matchMedia = original;
  });

  it('toggleTheme flips theme and updates data-theme and localStorage', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider><ThemeConsumer /></ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');

    act(() => {
      screen.getByTestId('toggle').click();
    });

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(storageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'dark');

    window.matchMedia = original;
  });

  it('restores persisted theme from localStorage regardless of system pref', () => {
    storageMock._store()[STORAGE_KEY] = 'dark';
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider><ThemeConsumer /></ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');

    window.matchMedia = original;
  });

  it('does not throw when matchMedia is unavailable (SSR safety)', () => {
    const original = window.matchMedia;
    // @ts-expect-error -- simulate missing matchMedia
    delete window.matchMedia;

    expect(() => {
      render(
        <ThemeProvider><ThemeConsumer /></ThemeProvider>,
      );
    }).not.toThrow();

    expect(screen.getByTestId('theme').textContent).toBe('light');

    window.matchMedia = original;
  });

  it('handles localStorage getItem throwing (SecurityError)', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    storageMock.getItem.mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    expect(() => {
      render(
        <ThemeProvider><ThemeConsumer /></ThemeProvider>,
      );
    }).not.toThrow();
    expect(screen.getByTestId('theme').textContent).toBe('light');

    window.matchMedia = original;
  });

  it('handles localStorage setItem throwing on toggle (QuotaExceededError)', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider><ThemeConsumer /></ThemeProvider>,
    );

    storageMock.setItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => {
      act(() => {
        screen.getByTestId('toggle').click();
      });
    }).not.toThrow();

    // Theme still toggles in-memory even if localStorage fails
    expect(screen.getByTestId('theme').textContent).toBe('dark');

    window.matchMedia = original;
  });
});
