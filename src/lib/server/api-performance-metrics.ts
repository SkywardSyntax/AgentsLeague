// API Performance Metrics — per-endpoint observability
export interface RequestRecord {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  timestamp: number;
}

export interface APIPerformanceSnapshot {
  totalRequests: number;
  avgResponseTime: number;
  errorRate: number;
  throughputPerSec: number;
  statusDistribution: Record<number, number>;
  slowEndpoints: Array<{ endpoint: string; avgTime: number }>;
  endpointBreakdown: Record<string, { count: number; avgTime: number; errorRate: number }>;
}

export interface APIPerformanceMetrics {
  recordRequest(endpoint: string, method: string, statusCode: number, responseTimeMs: number): void;
  getAvgResponseTime(endpoint?: string): number;
  getErrorRate(endpoint?: string): number;
  getThroughput(): number;
  getStatusDistribution(): Record<number, number>;
  getLatencyPercentile(percentile: number, endpoint?: string): number;
  getSlowEndpoints(thresholdMs?: number): Array<{ endpoint: string; avgTime: number }>;
  getRateLimitHits(): number;
  getEndpointBreakdown(): Record<string, { count: number; avgTime: number; errorRate: number }>;
  snapshot(): APIPerformanceSnapshot;
  reset(): void;
}

export function createAPIPerformanceMetrics(): APIPerformanceMetrics {
  let records: RequestRecord[] = [];

  function filtered(endpoint?: string): RequestRecord[] {
    return endpoint ? records.filter(r => r.endpoint === endpoint) : records;
  }

  return {
    recordRequest(endpoint, method, statusCode, responseTimeMs): void {
      records.push({ endpoint, method, statusCode, responseTimeMs, timestamp: Date.now() });
    },

    getAvgResponseTime(endpoint?): number {
      const recs = filtered(endpoint);
      if (recs.length === 0) return 0;
      return recs.reduce((s, r) => s + r.responseTimeMs, 0) / recs.length;
    },

    getErrorRate(endpoint?): number {
      const recs = filtered(endpoint);
      if (recs.length === 0) return 0;
      return recs.filter(r => r.statusCode >= 400).length / recs.length;
    },

    getThroughput(): number {
      if (records.length < 2) return 0;
      const elapsed = (records[records.length - 1].timestamp - records[0].timestamp) / 1000;
      return elapsed > 0 ? records.length / elapsed : 0;
    },

    getStatusDistribution(): Record<number, number> {
      const dist: Record<number, number> = {};
      for (const r of records) {
        dist[r.statusCode] = (dist[r.statusCode] ?? 0) + 1;
      }
      return dist;
    },

    getLatencyPercentile(percentile, endpoint?): number {
      const recs = filtered(endpoint);
      if (recs.length === 0) return 0;
      const sorted = recs.map(r => r.responseTimeMs).sort((a, b) => a - b);
      const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    },

    getSlowEndpoints(thresholdMs = 500): Array<{ endpoint: string; avgTime: number }> {
      const endpoints = [...new Set(records.map(r => r.endpoint))];
      return endpoints
        .map(ep => ({
          endpoint: ep,
          avgTime: this.getAvgResponseTime(ep),
        }))
        .filter(e => e.avgTime > thresholdMs)
        .sort((a, b) => b.avgTime - a.avgTime);
    },

    getRateLimitHits(): number {
      return records.filter(r => r.statusCode === 429).length;
    },

    getEndpointBreakdown(): Record<string, { count: number; avgTime: number; errorRate: number }> {
      const endpoints = [...new Set(records.map(r => r.endpoint))];
      const breakdown: Record<string, { count: number; avgTime: number; errorRate: number }> = {};
      for (const ep of endpoints) {
        const recs = records.filter(r => r.endpoint === ep);
        breakdown[ep] = {
          count: recs.length,
          avgTime: recs.reduce((s, r) => s + r.responseTimeMs, 0) / recs.length,
          errorRate: recs.filter(r => r.statusCode >= 400).length / recs.length,
        };
      }
      return breakdown;
    },

    snapshot(): APIPerformanceSnapshot {
      return {
        totalRequests: records.length,
        avgResponseTime: this.getAvgResponseTime(),
        errorRate: this.getErrorRate(),
        throughputPerSec: this.getThroughput(),
        statusDistribution: this.getStatusDistribution(),
        slowEndpoints: this.getSlowEndpoints(),
        endpointBreakdown: this.getEndpointBreakdown(),
      };
    },

    reset(): void {
      records = [];
    },
  };
}
