'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

function getSystemPreference(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getStoredPreference(): Theme | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function resolveTheme(): Theme {
  return getStoredPreference() ?? getSystemPreference();
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

// Module-level store so all consumers share one source of truth
let currentTheme: Theme = typeof window !== 'undefined' ? resolveTheme() : 'light';
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return 'light';
}

function setTheme(theme: Theme): void {
  currentTheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  listeners.forEach((l) => l());
}

// Initialize on first load
if (typeof window !== 'undefined') {
  applyTheme(currentTheme);

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => {
      // Only react to system changes when user hasn't set a preference
      if (!getStoredPreference()) {
        currentTheme = e.matches ? 'dark' : 'light';
        applyTheme(currentTheme);
        listeners.forEach((l) => l());
      }
    });
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Ensure DOM is in sync on mount (handles SSR hydration)
  useEffect(() => {
    applyTheme(currentTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, toggleTheme } as const;
}
