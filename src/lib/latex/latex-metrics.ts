// LaTeX Metrics — compilation and rendering observability
export interface CompilationRecord {
  timeMs: number;
  cached: boolean;
  error?: string;
  complexity: number;
  timestamp: number;
}

export interface LatexMetricsSnapshot {
  totalCompilations: number;
  avgCompileTime: number;
  cacheHitRatio: number;
  errorFrequency: number;
  avgComplexity: number;
  pipelineLatency: number;
  errorsByType: Record<string, number>;
}

export interface LatexMetrics {
  recordCompilation(timeMs: number, cached: boolean, complexity: number, error?: string): void;
  getAvgCompileTime(): number;
  getCacheHitRatio(): number;
  getErrorFrequency(): number;
  getComplexityScore(): number;
  getPipelineLatency(): number;
  getErrorsByType(): Record<string, number>;
  getBatchStats(lastN?: number): { count: number; avgTime: number; cacheRatio: number };
  snapshot(): LatexMetricsSnapshot;
  reset(): void;
}

export function createLatexMetrics(): LatexMetrics {
  let records: CompilationRecord[] = [];

  return {
    recordCompilation(timeMs, cached, complexity, error): void {
      records.push({ timeMs, cached, complexity, error, timestamp: Date.now() });
    },

    getAvgCompileTime(): number {
      if (records.length === 0) return 0;
      return records.reduce((s, r) => s + r.timeMs, 0) / records.length;
    },

    getCacheHitRatio(): number {
      if (records.length === 0) return 0;
      return records.filter(r => r.cached).length / records.length;
    },

    getErrorFrequency(): number {
      if (records.length === 0) return 0;
      return records.filter(r => r.error !== undefined).length / records.length;
    },

    getComplexityScore(): number {
      if (records.length === 0) return 0;
      return records.reduce((s, r) => s + r.complexity, 0) / records.length;
    },

    getPipelineLatency(): number {
      if (records.length < 2) return 0;
      const uncached = records.filter(r => !r.cached);
      if (uncached.length === 0) return 0;
      return uncached.reduce((s, r) => s + r.timeMs, 0) / uncached.length;
    },

    getErrorsByType(): Record<string, number> {
      const result: Record<string, number> = {};
      for (const r of records) {
        if (r.error) {
          result[r.error] = (result[r.error] ?? 0) + 1;
        }
      }
      return result;
    },

    getBatchStats(lastN?: number) {
      const batch = lastN ? records.slice(-lastN) : records;
      if (batch.length === 0) return { count: 0, avgTime: 0, cacheRatio: 0 };
      return {
        count: batch.length,
        avgTime: batch.reduce((s, r) => s + r.timeMs, 0) / batch.length,
        cacheRatio: batch.filter(r => r.cached).length / batch.length,
      };
    },

    snapshot(): LatexMetricsSnapshot {
      return {
        totalCompilations: records.length,
        avgCompileTime: this.getAvgCompileTime(),
        cacheHitRatio: this.getCacheHitRatio(),
        errorFrequency: this.getErrorFrequency(),
        avgComplexity: this.getComplexityScore(),
        pipelineLatency: this.getPipelineLatency(),
        errorsByType: this.getErrorsByType(),
      };
    },

    reset(): void {
      records = [];
    },
  };
}
