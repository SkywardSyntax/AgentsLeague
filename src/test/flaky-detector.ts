export interface FlakyEntry {
  testName: string;
  passCount: number;
  failCount: number;
  flaky: boolean;
}

export type FlakyReport = FlakyEntry[];

export interface FlakySummary {
  total: number;
  flaky: number;
  stable: number;
  flakyRate: number;
}

export interface FlakyDetector {
  record(testName: string, passed: boolean): void;
  analyze(): FlakyReport;
  summary(): FlakySummary;
  reset(): void;
}

export function createFlakyDetector(opts?: { runs?: number }): FlakyDetector {
  const _runs = opts?.runs ?? 5;
  void _runs; // available for future use (e.g. enforcing max recordings)

  const results = new Map<string, { pass: number; fail: number }>();

  function record(testName: string, passed: boolean): void {
    let entry = results.get(testName);
    if (!entry) {
      entry = { pass: 0, fail: 0 };
      results.set(testName, entry);
    }
    if (passed) {
      entry.pass++;
    } else {
      entry.fail++;
    }
  }

  function analyze(): FlakyReport {
    const report: FlakyReport = [];
    for (const [testName, counts] of results) {
      report.push({
        testName,
        passCount: counts.pass,
        failCount: counts.fail,
        flaky: counts.pass > 0 && counts.fail > 0,
      });
    }
    return report;
  }

  function summary(): FlakySummary {
    const report = analyze();
    const total = report.length;
    const flaky = report.filter((e) => e.flaky).length;
    return {
      total,
      flaky,
      stable: total - flaky,
      flakyRate: total === 0 ? 0 : flaky / total,
    };
  }

  function reset(): void {
    results.clear();
  }

  return { record, analyze, summary, reset };
}
