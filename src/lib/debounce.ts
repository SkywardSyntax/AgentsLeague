/**
 * Returns a debounced version of `fn` that delays invocation until `ms`
 * milliseconds have elapsed since the last call. Exposes `flush()` to
 * fire immediately and `cancel()` to discard pending invocations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<A extends any[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { flush(): void; cancel(): void } {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let latestArgs: A | null = null;

  function cancel() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    latestArgs = null;
  }

  function flush() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (latestArgs !== null) {
      const args = latestArgs;
      latestArgs = null;
      fn(...args);
    }
  }

  function debounced(...args: A) {
    latestArgs = args;
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      if (latestArgs !== null) {
        const a = latestArgs;
        latestArgs = null;
        fn(...a);
      }
    }, ms);
  }

  debounced.flush = flush;
  debounced.cancel = cancel;
  return debounced;
}
