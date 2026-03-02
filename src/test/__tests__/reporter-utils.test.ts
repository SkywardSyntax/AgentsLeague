import { describe, it, expect } from 'vitest';
import {
  formatTestResult,
  formatDuration,
  summarizeRun,
  groupByFile,
} from '../reporter-utils';
import type { TestResult } from '../reporter-utils';

describe('Lane 07 — Test Reporter Utilities', () => {
  it('formatTestResult() formats passing test as green checkmark', () => {
    const result: TestResult = { name: 'adds numbers', status: 'pass', duration: 12 };
    expect(formatTestResult(result)).toContain('✓');
    expect(formatTestResult(result)).toContain('adds numbers');
  });

  it('formatTestResult() formats failing test as red X', () => {
    const result: TestResult = { name: 'fails', status: 'fail', duration: 5 };
    expect(formatTestResult(result)).toContain('✗');
  });

  it('formatTestResult() formats skipped test as yellow dash', () => {
    const result: TestResult = { name: 'skipped', status: 'skip', duration: 0 };
    expect(formatTestResult(result)).toContain('-');
  });

  it('summarizeRun() counts pass/fail/skip totals', () => {
    const results: TestResult[] = [
      { name: 'a', status: 'pass', duration: 10 },
      { name: 'b', status: 'fail', duration: 20 },
      { name: 'c', status: 'skip', duration: 0 },
      { name: 'd', status: 'pass', duration: 5 },
    ];
    const summary = summarizeRun(results);
    expect(summary.total).toBe(4);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(1);
  });

  it('summarizeRun() calculates total duration', () => {
    const results: TestResult[] = [
      { name: 'a', status: 'pass', duration: 100 },
      { name: 'b', status: 'pass', duration: 200 },
    ];
    expect(summarizeRun(results).duration).toBe(300);
  });

  it('formatDuration() formats milliseconds to human-readable', () => {
    expect(formatDuration(42)).toBe('42ms');
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('formatDuration() handles zero ms', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formatDuration() handles large durations (minutes)', () => {
    expect(formatDuration(125_000)).toBe('2m 5s');
  });

  it('groupByFile() groups results by file path', () => {
    const results: TestResult[] = [
      { name: 'a', status: 'pass', duration: 1, file: 'a.test.ts' },
      { name: 'b', status: 'pass', duration: 2, file: 'b.test.ts' },
      { name: 'c', status: 'fail', duration: 3, file: 'a.test.ts' },
    ];
    const groups = groupByFile(results);
    expect(groups.get('a.test.ts')).toHaveLength(2);
    expect(groups.get('b.test.ts')).toHaveLength(1);
  });

  it('TestResult type requires name, status, and duration fields', () => {
    const r: TestResult = { name: 'test', status: 'pass', duration: 0 };
    expect(r).toHaveProperty('name');
    expect(r).toHaveProperty('status');
    expect(r).toHaveProperty('duration');
  });
});
