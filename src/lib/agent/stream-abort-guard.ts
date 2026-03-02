/**
 * Stream abort guard — ensures aborting a stream mid-parse doesn't corrupt shared state.
 * Snapshots accumulated state before parsing and rolls back on abort.
 */

export interface StreamAbortGuard<TState> {
  process(chunk: string): void;
  abort(): void;
  getState(): TState;
  isAborted(): boolean;
  reset(): void;
}

export function createStreamAbortGuard<TState>(
  initialState: TState,
  parser: (state: TState, chunk: string) => TState,
  clone: (state: TState) => TState,
): StreamAbortGuard<TState> {
  let current = clone(initialState);
  let checkpoint = clone(initialState);
  let aborted = false;

  function process(chunk: string): void {
    if (aborted) return;
    checkpoint = clone(current);
    try {
      current = parser(current, chunk);
    } catch {
      // Roll back to last checkpoint on parse error
      current = clone(checkpoint);
      aborted = true;
    }
  }

  function abort(): void {
    if (aborted) return;
    current = clone(checkpoint);
    aborted = true;
  }

  function getState(): TState {
    return clone(current);
  }

  function reset(): void {
    current = clone(initialState);
    checkpoint = clone(initialState);
    aborted = false;
  }

  return {
    process,
    abort,
    getState,
    isAborted: () => aborted,
    reset,
  };
}
