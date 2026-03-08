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

/** Buffered response snapshot shared across dedup waiters. */
interface BufferedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
}

/** Each PendingEntry stores a promise that resolves to a buffered snapshot. */
interface BufferedPendingEntry {
  promise: Promise<BufferedResponse>;
  expiresAt: number | null;
}

export function createRequestDedup(): RequestDedup {
  const inflight = new Map<string, BufferedPendingEntry>();

  /** Convert a buffered snapshot to a fresh Response instance. */
  function makeResponse(snap: BufferedResponse): Response {
    return new Response(snap.body.slice(0), {
      status: snap.status,
      statusText: snap.statusText,
      headers: snap.headers,
    });
  }

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
        // Each waiter gets its own fresh Response with an unconsumed body.
        return existing.promise.then(makeResponse);
      }
    }

    // Buffer the response body so multiple waiters can each read it safely.
    const promise = fetchFn()
      .then(async (response): Promise<BufferedResponse> => {
        const body = await response.arrayBuffer();
        const headers: Record<string, string> = {};
        response.headers.forEach((value, name) => {
          headers[name] = value;
        });
        return {
          status: response.status,
          statusText: response.statusText,
          headers,
          body,
        };
      })
      .finally(() => {
        if (inflight.get(key)?.promise === promise) {
          inflight.delete(key);
        }
      });

    inflight.set(key, {
      promise,
      expiresAt: ttlMs != null ? Date.now() + ttlMs : null,
    });

    return promise.then(makeResponse);
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
