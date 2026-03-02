/**
 * Send lock — prevents duplicate message sends from rapid button clicks.
 * While a send is in-flight, subsequent calls return the existing promise.
 */

export interface SendLock<T> {
  acquire(key: string, sendFn: () => Promise<T>): Promise<T>;
  isLocked(key: string): boolean;
  release(key: string): void;
}

export function createSendLock<T>(): SendLock<T> {
  const inflight = new Map<string, Promise<T>>();

  function acquire(key: string, sendFn: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = sendFn().finally(() => {
      // Only clear if this is still the active promise for this key
      if (inflight.get(key) === promise) {
        inflight.delete(key);
      }
    });

    inflight.set(key, promise);
    return promise;
  }

  function isLocked(key: string): boolean {
    return inflight.has(key);
  }

  function release(key: string): void {
    inflight.delete(key);
  }

  return { acquire, isLocked, release };
}
