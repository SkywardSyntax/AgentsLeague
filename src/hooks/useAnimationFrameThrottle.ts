import { useCallback, useRef } from 'react';

/**
 * Returns a throttled version of `callback` that fires at most `fps` times
 * per second, aligned to requestAnimationFrame ticks.
 *
 * Useful for non-critical visual updates (coordinate readouts, statistics)
 * that don't need 60 fps precision.
 */
export function useAnimationFrameThrottle<Args extends unknown[]>(
  callback: (...args: Args) => void,
  fps = 10,
): (...args: Args) => void {
  const lastCallRef = useRef(-Infinity);
  const rafIdRef = useRef<number | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const intervalMs = 1000 / fps;

  return useCallback(
    (...args: Args) => {
      pendingArgsRef.current = args;
      if (rafIdRef.current !== null) return; // already scheduled

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const now = performance.now();
        if (now - lastCallRef.current >= intervalMs) {
          lastCallRef.current = now;
          if (pendingArgsRef.current !== null) {
            callbackRef.current(...pendingArgsRef.current);
            pendingArgsRef.current = null;
          }
        } else {
          // Not enough time has elapsed — schedule one more rAF to catch up
          rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            lastCallRef.current = performance.now();
            if (pendingArgsRef.current !== null) {
              callbackRef.current(...pendingArgsRef.current);
              pendingArgsRef.current = null;
            }
          });
        }
      });
    },
    [intervalMs],
  );
}
