export interface MemoizedFn<A extends unknown[], R> {
  (...args: A): R;
  cacheStats(): { hits: number; misses: number; size: number };
  clearCache(): void;
}

interface CacheEntry<R> {
  key: string;
  value: R;
}

function stableKey(args: unknown[]): string {
  return JSON.stringify(args, (_key, value) => {
    if (value === undefined) return '__undefined__';
    if (value === null) return null;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
}

export function createMemoizedFn<A extends unknown[], R>(
  fn: (...args: A) => R,
  maxSize = 64,
): MemoizedFn<A, R> {
  const cache: CacheEntry<R>[] = [];
  let hits = 0;
  let misses = 0;

  const memoized = (...args: A): R => {
    const key = stableKey(args);

    const idx = cache.findIndex((e) => e.key === key);
    if (idx !== -1) {
      hits++;
      const entry = cache[idx]!;
      // Move to end (most recent)
      cache.splice(idx, 1);
      cache.push(entry);
      return entry.value;
    }

    misses++;
    const value = fn(...args);

    if (cache.length >= maxSize) {
      cache.shift(); // evict oldest
    }
    cache.push({ key, value });

    return value;
  };

  memoized.cacheStats = () => ({ hits, misses, size: cache.length });

  memoized.clearCache = () => {
    cache.length = 0;
    hits = 0;
    misses = 0;
  };

  return memoized;
}
