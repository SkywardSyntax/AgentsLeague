/**
 * Test reporter utilities — helpers for structured test output.
 */

export type TestStatus = 'pass' | 'fail' | 'skip';

export interface TestResult {
  name: string;
  status: TestStatus;
  duration: number;
  file?: string;
  error?: string;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export function formatTestResult(result: TestResult): string {
  const icons: Record<TestStatus, string> = {
    pass: '✓',
    fail: '✗',
    skip: '-',
  };
  const icon = icons[result.status];
  const time = formatDuration(result.duration);
  return `${icon} ${result.name} (${time})`;
}

export function formatDuration(ms: number): string {
  if (ms === 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function summarizeRun(results: TestResult[]): RunSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let duration = 0;

  for (const r of results) {
    duration += r.duration;
    if (r.status === 'pass') passed++;
    else if (r.status === 'fail') failed++;
    else skipped++;
  }

  return { total: results.length, passed, failed, skipped, duration };
}

export function groupByFile(results: TestResult[]): Map<string, TestResult[]> {
  const groups = new Map<string, TestResult[]>();
  for (const r of results) {
    const file = r.file ?? '<unknown>';
    const list = groups.get(file);
    if (list) {
      list.push(r);
    } else {
      groups.set(file, [r]);
    }
  }
  return groups;
}
