'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { WhiteboardProvider } from '@/stores/whiteboard-store';
import { ErrorBoundary } from '@/components/error-boundary';

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Reading stored preference from localStorage on mount
    const stored = localStorage.getItem('theme');
    const resolved = (stored === 'dark' || stored === 'light')
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : null;
    if (resolved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync initialization from localStorage on mount
      setTheme(resolved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <>
      <button
        onClick={toggleTheme}
        aria-label="Toggle dark mode"
        className="fixed top-3 right-3 z-50 rounded-lg p-2 bg-[var(--color-surface)] border border-[var(--color-border)] cursor-pointer text-sm hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
      {children}
    </>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <WhiteboardProvider>{children}</WhiteboardProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
