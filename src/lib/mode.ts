export type AppMode = 'interactive' | 'agent';

/**
 * Server-safe initial mode (must be deterministic for SSR hydration).
 */
export function getInitialAppMode(): AppMode {
  return process.env.NEXT_PUBLIC_MODE === 'agent' ? 'agent' : 'interactive';
}

/**
 * Client-resolved mode with URL override.
 */
export function getClientAppMode(search: string): AppMode {
  const urlMode = new URLSearchParams(search).get('mode');
  if (urlMode === 'agent') return 'agent';
  return getInitialAppMode();
}
