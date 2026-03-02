export type AppMode = 'interactive' | 'agent';

/**
 * App mode precedence:
 * 1) URL query `?mode=agent`
 * 2) `NEXT_PUBLIC_MODE=agent`
 * 3) default `interactive`
 */
export function getAppMode(): AppMode {
  if (typeof window !== 'undefined') {
    const urlMode = new URLSearchParams(window.location.search).get('mode');
    if (urlMode === 'agent') return 'agent';
  }

  return process.env.NEXT_PUBLIC_MODE === 'agent' ? 'agent' : 'interactive';
}
