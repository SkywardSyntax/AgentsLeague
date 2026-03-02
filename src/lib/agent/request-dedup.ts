/**
 * Request dedup — deduplicates identical in-flight API requests.
 * Uses request key (method + URL + body hash) to share a single promise.
 */

export interface RequestDedup {
  fetch(
    key: string,
    fetchFn: () => Promise<Response>,
    ttlMs?: number,
  ): Promise<Response>;
  pendingCount(): number;
  clear(): void;
}

interface PendingEntry {
  promise: Promise<Response>;
  expiresAt: number | null;
}

export function createRequestDedup(): RequestDedup {
  const inflight = new Map<string, PendingEntry>();

  function dedupFetch(
    key: string,
    fetchFn: () => Promise<Response>,
    ttlMs?: number,
  ): Promise<Response> {
    const existing = inflight.get(key);
    if (existing) {
      // Check TTL expiry
      if (existing.expiresAt !== null && Date.now() > existing.expiresAt) {
        inflight.delete(key);
      } else {
        return existing.promise;
      }
    }

    const promise = fetchFn().finally(() => {
      if (inflight.get(key)?.promise === promise) {
        inflight.delete(key);
      }
    });

    inflight.set(key, {
      promise,
      expiresAt: ttlMs != null ? Date.now() + ttlMs : null,
    });

    return promise;
  }

  function clear(): void {
    inflight.clear();
  }

  return {
    fetch: dedupFetch,
    pendingCount: () => inflight.size,
    clear,
  };
}

export function buildRequestKey(method: string, url: string, body?: string): string {
  const bodyPart = body ? simpleHash(body) : '';
  return `${method.toUpperCase()}:${url}:${bodyPart}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash.toString(36);
}
