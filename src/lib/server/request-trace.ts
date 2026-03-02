export interface RequestTraceEntry {
  requestId: string;
  method: string;
  path: string;
  startTs: number;
  endTs?: number;
  durationMs?: number;
  status?: number;
  requestBytes?: number;
  responseBytes?: number;
  error?: string;
}

export interface RequestTracer {
  start(requestId: string, method: string, path: string, requestBytes?: number): void;
  finish(requestId: string, status: number, responseBytes?: number): void;
  finishWithError(requestId: string, error: string): void;
  getEntry(requestId: string): RequestTraceEntry | undefined;
  recentEntries(limit?: number): RequestTraceEntry[];
  avgDurationMs(): number;
  errorRate(): number;
  reset(): void;
}

export function createRequestTracer(maxEntries = 500): RequestTracer {
  const entries: RequestTraceEntry[] = [];
  const idIndex = new Map<string, number>();

  function evictIfNeeded(): void {
    while (entries.length > maxEntries) {
      const removed = entries.shift()!;
      idIndex.delete(removed.requestId);
      // Re-index after shift
      for (let i = 0; i < entries.length; i++) {
        idIndex.set(entries[i]!.requestId, i);
      }
    }
  }

  return {
    start(requestId, method, path, requestBytes) {
      const entry: RequestTraceEntry = {
        requestId,
        method,
        path,
        startTs: Date.now(),
        requestBytes,
      };
      entries.push(entry);
      idIndex.set(requestId, entries.length - 1);
      evictIfNeeded();
    },

    finish(requestId, status, responseBytes) {
      const idx = idIndex.get(requestId);
      if (idx === undefined) return;
      const entry = entries[idx];
      if (!entry) return;
      entry.endTs = Date.now();
      entry.durationMs = entry.endTs - entry.startTs;
      entry.status = status;
      entry.responseBytes = responseBytes;
    },

    finishWithError(requestId, error) {
      const idx = idIndex.get(requestId);
      if (idx === undefined) return;
      const entry = entries[idx];
      if (!entry) return;
      entry.endTs = Date.now();
      entry.durationMs = entry.endTs - entry.startTs;
      entry.error = error;
    },

    getEntry(requestId) {
      const idx = idIndex.get(requestId);
      if (idx === undefined) return undefined;
      return entries[idx];
    },

    recentEntries(limit) {
      const reversed = [...entries].reverse();
      return limit !== undefined ? reversed.slice(0, limit) : reversed;
    },

    avgDurationMs() {
      const finished = entries.filter((e) => e.durationMs !== undefined);
      if (finished.length === 0) return 0;
      const sum = finished.reduce((acc, e) => acc + e.durationMs!, 0);
      return sum / finished.length;
    },

    errorRate() {
      if (entries.length === 0) return 0;
      const errored = entries.filter((e) => e.error !== undefined);
      return errored.length / entries.length;
    },

    reset() {
      entries.length = 0;
      idIndex.clear();
    },
  };
}
