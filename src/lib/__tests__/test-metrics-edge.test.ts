import { describe, expect, it } from 'vitest';
import { createTestMetricsCollector } from '@/lib/client/test-metrics-collector';

describe('test-metrics-collector edge cases', () => {
  it('getPassRate returns 0 with no results', () => {
    const c = createTestMetricsCollector();
    expect(c.getPassRate()).toBe(0);
  });

  it('getAvgDuration returns 0 with no results', () => {
    const c = createTestMetricsCollector();
    expect(c.getAvgDuration()).toBe(0);
  });

  it('getFlakinessRate returns 0 for a single run', () => {
    const c = createTestMetricsCollector();
    c.recordResult('test-a', 'suite1', 'pass', 10);
    expect(c.getFlakinessRate('test-a')).toBe(0);
  });

  it('getFlakinessRate returns 0 when all runs have same status', () => {
    const c = createTestMetricsCollector();
    c.recordResult('test-b', 'suite1', 'pass', 5);
    c.recordResult('test-b', 'suite1', 'pass', 6);
    c.recordResult('test-b', 'suite1', 'pass', 7);
    expect(c.getFlakinessRate('test-b')).toBe(0);
  });

  it('getFlakinessRate returns 1 when status alternates every run', () => {
    const c = createTestMetricsCollector();
    c.recordResult('flaky', 'suite1', 'pass', 5);
    c.recordResult('flaky', 'suite1', 'fail', 6);
    c.recordResult('flaky', 'suite1', 'pass', 7);
    expect(c.getFlakinessRate('flaky')).toBe(1);
  });

  it('getSlowestTests respects custom n parameter', () => {
    const c = createTestMetricsCollector();
    c.recordResult('a', 's', 'pass', 100);
    c.recordResult('b', 's', 'pass', 200);
    c.recordResult('c', 's', 'pass', 300);
    const top2 = c.getSlowestTests(2);
    expect(top2).toHaveLength(2);
    expect(top2[0]!.name).toBe('c');
    expect(top2[1]!.name).toBe('b');
  });

  it('getSuiteBreakdown categorizes multiple suites', () => {
    const c = createTestMetricsCollector();
    c.recordResult('t1', 'alpha', 'pass', 10);
    c.recordResult('t2', 'alpha', 'fail', 20);
    c.recordResult('t3', 'beta', 'skip', 5);
    const breakdown = c.getSuiteBreakdown();
    expect(breakdown['alpha']).toEqual({ pass: 1, fail: 1, skip: 0 });
    expect(breakdown['beta']).toEqual({ pass: 0, fail: 0, skip: 1 });
  });

  it('getFailureCategories returns empty object when no failures', () => {
    const c = createTestMetricsCollector();
    c.recordResult('t1', 'suite', 'pass', 10);
    expect(c.getFailureCategories()).toEqual({});
  });

  it('snapshot includes flakiness only for flaky tests', () => {
    const c = createTestMetricsCollector();
    c.recordResult('stable', 's', 'pass', 10);
    c.recordResult('stable', 's', 'pass', 11);
    c.recordResult('flaky', 's', 'pass', 10);
    c.recordResult('flaky', 's', 'fail', 11);
    const snap = c.snapshot();
    expect(snap.flakiness['stable']).toBeUndefined();
    expect(snap.flakiness['flaky']).toBeGreaterThan(0);
  });

  it('reset clears all results and coverage', () => {
    const c = createTestMetricsCollector();
    c.recordResult('t1', 's', 'pass', 10);
    c.recordCoverage(85);
    c.reset();
    expect(c.getPassRate()).toBe(0);
    expect(c.getCoverageTrend()).toHaveLength(0);
    expect(c.snapshot().totalTests).toBe(0);
  });
});
