// Test Metrics Collector — test suite observability
export type TestStatus = 'pass' | 'fail' | 'skip';

export interface TestResult {
  testName: string;
  suite: string;
  status: TestStatus;
  durationMs: number;
  timestamp: number;
}

export interface CoveragePoint {
  timestamp: number;
  percentage: number;
}

export interface TestMetricsSnapshot {
  totalTests: number;
  passRate: number;
  avgDuration: number;
  slowestTests: Array<{ name: string; durationMs: number }>;
  flakiness: Record<string, number>;
  suiteBreakdown: Record<string, { pass: number; fail: number; skip: number }>;
}

export interface TestMetricsCollector {
  recordResult(testName: string, suite: string, status: TestStatus, durationMs: number): void;
  recordCoverage(percentage: number): void;
  getPassRate(): number;
  getAvgDuration(): number;
  getSlowestTests(n?: number): Array<{ name: string; durationMs: number }>;
  getFlakinessRate(testName: string): number;
  getCoverageTrend(): readonly CoveragePoint[];
  getSuiteBreakdown(): Record<string, { pass: number; fail: number; skip: number }>;
  getFailureCategories(): Record<string, string[]>;
  snapshot(): TestMetricsSnapshot;
  reset(): void;
}

export function createTestMetricsCollector(): TestMetricsCollector {
  let results: TestResult[] = [];
  let coveragePoints: CoveragePoint[] = [];

  return {
    recordResult(testName, suite, status, durationMs): void {
      results.push({ testName, suite, status, durationMs, timestamp: Date.now() });
    },

    recordCoverage(percentage): void {
      coveragePoints.push({ timestamp: Date.now(), percentage });
    },

    getPassRate(): number {
      if (results.length === 0) return 0;
      return results.filter(r => r.status === 'pass').length / results.length;
    },

    getAvgDuration(): number {
      if (results.length === 0) return 0;
      return results.reduce((s, r) => s + r.durationMs, 0) / results.length;
    },

    getSlowestTests(n = 5): Array<{ name: string; durationMs: number }> {
      const sorted = [...results].sort((a, b) => b.durationMs - a.durationMs);
      return sorted.slice(0, n).map(r => ({ name: r.testName, durationMs: r.durationMs }));
    },

    getFlakinessRate(testName): number {
      const runs = results.filter(r => r.testName === testName);
      if (runs.length < 2) return 0;
      let flips = 0;
      for (let i = 1; i < runs.length; i++) {
        if (runs[i].status !== runs[i - 1].status) flips++;
      }
      return flips / (runs.length - 1);
    },

    getCoverageTrend(): readonly CoveragePoint[] {
      return coveragePoints;
    },

    getSuiteBreakdown(): Record<string, { pass: number; fail: number; skip: number }> {
      const breakdown: Record<string, { pass: number; fail: number; skip: number }> = {};
      for (const r of results) {
        if (!breakdown[r.suite]) breakdown[r.suite] = { pass: 0, fail: 0, skip: 0 };
        breakdown[r.suite][r.status]++;
      }
      return breakdown;
    },

    getFailureCategories(): Record<string, string[]> {
      const categories: Record<string, string[]> = {};
      for (const r of results) {
        if (r.status === 'fail') {
          if (!categories[r.suite]) categories[r.suite] = [];
          categories[r.suite].push(r.testName);
        }
      }
      return categories;
    },

    snapshot(): TestMetricsSnapshot {
      const flakinessMap: Record<string, number> = {};
      const uniqueTests = [...new Set(results.map(r => r.testName))];
      for (const name of uniqueTests) {
        const rate = this.getFlakinessRate(name);
        if (rate > 0) flakinessMap[name] = rate;
      }
      return {
        totalTests: results.length,
        passRate: this.getPassRate(),
        avgDuration: this.getAvgDuration(),
        slowestTests: this.getSlowestTests(),
        flakiness: flakinessMap,
        suiteBreakdown: this.getSuiteBreakdown(),
      };
    },

    reset(): void {
      results = [];
      coveragePoints = [];
    },
  };
}
