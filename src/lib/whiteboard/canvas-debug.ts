/**
 * Compute FPS from a ring buffer of frame time deltas (in ms).
 * Ignores outlier frames > 200ms to avoid skewing.
 * Returns 0 if buffer is empty.
 */
export function computeFps(deltas: number[]): number {
  const filtered = deltas.filter(d => d > 0 && d <= 200);
  if (filtered.length === 0) return 0;
  const avg = filtered.reduce((sum, d) => sum + d, 0) / filtered.length;
  return avg > 0 ? 1000 / avg : 0;
}

/**
 * Format FPS to 1 decimal place.
 */
export function formatFps(fps: number): string {
  return fps.toFixed(1);
}

/**
 * Check if a keyboard event matches the debug shortcut Ctrl+Shift+D.
 * Case-insensitive for the key.
 */
export function isDebugShortcut(event: { ctrlKey: boolean; shiftKey: boolean; key: string; metaKey?: boolean }): boolean {
  return event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd';
}

/**
 * Toggle debug overlay visibility.
 */
export function toggleDebugOverlay(ref: { current: boolean }): boolean {
  ref.current = !ref.current;
  return ref.current;
}

/**
 * Create a draw-call counter that can be reset each frame.
 */
export function createDrawCallCounter(): {
  reset: () => void;
  increment: () => void;
  read: () => number;
} {
  let count = 0;
  return {
    reset: () => { count = 0; },
    increment: () => { count++; },
    read: () => count,
  };
}
