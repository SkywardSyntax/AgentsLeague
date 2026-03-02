/**
 * Isolation helpers — create scoped environments for parallel test suites
 * to prevent cross-contamination of global state.
 */

let idCounter = 0;

export function uniqueTestId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${++idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface IsolatedStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}

export function createIsolatedStore(): IsolatedStore {
  const data = new Map<string, unknown>();
  return {
    get: (key) => data.get(key),
    set: (key, value) => { data.set(key, value); },
    has: (key) => data.has(key),
    delete: (key) => data.delete(key),
    clear: () => data.clear(),
    size: () => data.size,
  };
}

export function withIsolatedGlobal<T>(
  target: Record<string, unknown>,
  key: string,
  tempValue: unknown,
  fn: () => T,
): T {
  const hadKey = key in target;
  const original = target[key];
  target[key] = tempValue;
  try {
    return fn();
  } finally {
    if (hadKey) {
      target[key] = original;
    } else {
      delete target[key];
    }
  }
}

export function createIsolatedMap<K, V>(): Map<K, V> {
  return new Map<K, V>();
}
