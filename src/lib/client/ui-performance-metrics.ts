// UI Performance Metrics — Core Web Vitals tracking
export type WebVitalName = 'FCP' | 'LCP' | 'CLS' | 'INP';

export interface VitalRecord {
  name: WebVitalName;
  value: number;
  page?: string;
  timestamp: number;
}

export interface UIPerformanceSnapshot {
  vitals: Record<WebVitalName, { p50: number; p95: number; p99: number; avg: number }>;
  performanceScore: number;
  regressions: WebVitalName[];
  totalRecords: number;
}

export interface UIPerformanceMetrics {
  record(name: WebVitalName, value: number, page?: string): void;
  getPercentile(name: WebVitalName, percentile: number): number;
  getAverage(name: WebVitalName): number;
  getPerformanceScore(): number;
  detectRegressions(baselineWindow?: number): WebVitalName[];
  getPageBreakdown(page: string): Partial<Record<WebVitalName, number>>;
  snapshot(): UIPerformanceSnapshot;
  reset(): void;
}

// Good thresholds per CWV spec
const GOOD_THRESHOLDS: Record<WebVitalName, number> = {
  FCP: 1800,
  LCP: 2500,
  CLS: 0.1,
  INP: 200,
};

export function createUIPerformanceMetrics(): UIPerformanceMetrics {
  let records: VitalRecord[] = [];

  function getByName(name: WebVitalName): number[] {
    return records.filter(r => r.name === name).map(r => r.value).sort((a, b) => a - b);
  }

  function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const idx = Math.ceil((p / 100) * values.length) - 1;
    return values[Math.max(0, idx)];
  }

  return {
    record(name, value, page): void {
      records.push({ name, value, page, timestamp: Date.now() });
    },

    getPercentile(name, p): number {
      return percentile(getByName(name), p);
    },

    getAverage(name): number {
      const vals = getByName(name);
      if (vals.length === 0) return 0;
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    },

    getPerformanceScore(): number {
      const names: WebVitalName[] = ['FCP', 'LCP', 'CLS', 'INP'];
      let score = 0;
      let counted = 0;
      for (const name of names) {
        const vals = getByName(name);
        if (vals.length === 0) continue;
        const p75 = percentile(vals, 75);
        const ratio = Math.min(1, GOOD_THRESHOLDS[name] / Math.max(p75, 0.001));
        score += ratio * 25;
        counted++;
      }
      return counted > 0 ? (score / counted) * (counted / names.length) * (names.length / counted) : 0;
    },

    detectRegressions(baselineWindow = 5): WebVitalName[] {
      const names: WebVitalName[] = ['FCP', 'LCP', 'CLS', 'INP'];
      const regressions: WebVitalName[] = [];
      for (const name of names) {
        const vals = records.filter(r => r.name === name);
        if (vals.length < baselineWindow * 2) continue;
        const baseline = vals.slice(0, baselineWindow);
        const recent = vals.slice(-baselineWindow);
        const baseAvg = baseline.reduce((s, v) => s + v.value, 0) / baseline.length;
        const recentAvg = recent.reduce((s, v) => s + v.value, 0) / recent.length;
        if (recentAvg > baseAvg * 1.2) regressions.push(name);
      }
      return regressions;
    },

    getPageBreakdown(page): Partial<Record<WebVitalName, number>> {
      const pageRecords = records.filter(r => r.page === page);
      const result: Partial<Record<WebVitalName, number>> = {};
      for (const name of ['FCP', 'LCP', 'CLS', 'INP'] as WebVitalName[]) {
        const vals = pageRecords.filter(r => r.name === name);
        if (vals.length > 0) {
          result[name] = vals.reduce((s, v) => s + v.value, 0) / vals.length;
        }
      }
      return result;
    },

    snapshot(): UIPerformanceSnapshot {
      const names: WebVitalName[] = ['FCP', 'LCP', 'CLS', 'INP'];
      const vitals = {} as Record<WebVitalName, { p50: number; p95: number; p99: number; avg: number }>;
      for (const name of names) {
        const vals = getByName(name);
        vitals[name] = {
          p50: percentile(vals, 50),
          p95: percentile(vals, 95),
          p99: percentile(vals, 99),
          avg: vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0,
        };
      }
      return {
        vitals,
        performanceScore: this.getPerformanceScore(),
        regressions: this.detectRegressions(),
        totalRecords: records.length,
      };
    },

    reset(): void {
      records = [];
    },
  };
}
