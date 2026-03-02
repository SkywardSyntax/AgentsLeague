export interface RenderTimingEntry {
  tex: string;
  startTs: number;
  endTs: number;
  durationMs: number;
  cached: boolean;
  error?: string;
}

export interface RenderProfileSnapshot {
  totalRenders: number;
  cacheHitRate: number;
  avgRenderMs: number;
  p95RenderMs: number;
  slowestExpression: { tex: string; durationMs: number } | null;
  currentQueueDepth: number;
  errorCount: number;
  errorsByType: Record<string, number>;
}

export interface RenderProfiler {
  startRender(tex: string): () => void;
  recordCacheHit(tex: string): void;
  recordError(tex: string, error: string): void;
  setQueueDepth(depth: number): void;
  snapshot(): RenderProfileSnapshot;
  reset(): void;
}

export function createRenderProfiler(maxEntries = 100): RenderProfiler {
  let entries: RenderTimingEntry[] = [];
  let cacheHits = 0;
  let totalRequests = 0;
  let queueDepth = 0;
  let errorCount = 0;
  const errorsByType: Record<string, number> = {};
  const activeRenders = new Set<symbol>();

  function addEntry(entry: RenderTimingEntry) {
    entries.push(entry);
    if (entries.length > maxEntries) {
      entries = entries.slice(entries.length - maxEntries);
    }
  }

  return {
    startRender(tex: string): () => void {
      const token = Symbol();
      activeRenders.add(token);
      const startTs = performance.now();
      totalRequests++;

      return () => {
        if (!activeRenders.has(token)) return;
        activeRenders.delete(token);
        const endTs = performance.now();
        addEntry({
          tex,
          startTs,
          endTs,
          durationMs: endTs - startTs,
          cached: false,
        });
      };
    },

    recordCacheHit(tex: string): void {
      cacheHits++;
      totalRequests++;
      // Cache hits are not added as timing entries
      void tex;
    },

    recordError(tex: string, error: string): void {
      errorCount++;
      errorsByType[error] = (errorsByType[error] ?? 0) + 1;
      void tex;
    },

    setQueueDepth(depth: number): void {
      queueDepth = depth;
    },

    snapshot(): RenderProfileSnapshot {
      const renderEntries = entries.filter((e) => !e.cached);
      const durations = renderEntries.map((e) => e.durationMs);

      let avgRenderMs = 0;
      let p95RenderMs = 0;
      let slowestExpression: { tex: string; durationMs: number } | null = null;

      if (durations.length > 0) {
        avgRenderMs = durations.reduce((a, b) => a + b, 0) / durations.length;

        const sorted = [...durations].sort((a, b) => a - b);
        const p95Index = Math.ceil(sorted.length * 0.95) - 1;
        p95RenderMs = sorted[Math.max(0, p95Index)]!;

        let maxDuration = -1;
        for (const entry of renderEntries) {
          if (entry.durationMs > maxDuration) {
            maxDuration = entry.durationMs;
            slowestExpression = { tex: entry.tex, durationMs: entry.durationMs };
          }
        }
      }

      return {
        totalRenders: renderEntries.length,
        cacheHitRate: totalRequests > 0 ? cacheHits / totalRequests : 0,
        avgRenderMs,
        p95RenderMs,
        slowestExpression,
        currentQueueDepth: queueDepth,
        errorCount,
        errorsByType: { ...errorsByType },
      };
    },

    reset(): void {
      entries = [];
      cacheHits = 0;
      totalRequests = 0;
      queueDepth = 0;
      errorCount = 0;
      for (const key of Object.keys(errorsByType)) {
        delete errorsByType[key];
      }
      activeRenders.clear();
    },
  };
}
