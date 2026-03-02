/**
 * Ordered dispatch — serializes action application so rapid successive dispatches
 * are applied in dispatch order regardless of async timing.
 */

export type Reducer<S, A> = (state: S, action: A) => S | Promise<S>;
export type Listener<S> = (state: S) => void;

export interface OrderedDispatcher<S, A> {
  dispatch(action: A): Promise<S>;
  getState(): S;
  subscribe(listener: Listener<S>): () => void;
  isIdle(): boolean;
}

export function createOrderedDispatcher<S, A>(
  reducer: Reducer<S, A>,
  initialState: S,
): OrderedDispatcher<S, A> {
  let state = initialState;
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;
  const listeners = new Set<Listener<S>>();

  function dispatch(action: A): Promise<S> {
    pending++;
    const result = new Promise<S>((resolve, reject) => {
      queue = queue.then(async () => {
        try {
          state = await reducer(state, action);
          listeners.forEach((fn) => fn(state));
          resolve(state);
        } catch (err) {
          reject(err);
        } finally {
          pending--;
        }
      });
    });
    return result;
  }

  function subscribe(listener: Listener<S>): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    dispatch,
    getState: () => state,
    subscribe,
    isIdle: () => pending === 0,
  };
}
