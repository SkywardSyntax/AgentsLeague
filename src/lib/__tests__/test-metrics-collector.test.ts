import { describe, it, expect } from 'vitest';
import { createTestMetricsCollector } from '@/lib/client/test-metrics-collector';

describe('TestMetricsCollector', () => {
  it('should start with empty state', () => {
    const collector = createTestMetricsCollector();
    expect(collector.snapshot().totalTests).toBe(0);
    expect(collector.getPassRate()).toBe(0);
  });

  it('should record a test result', () => {
    const collector = createTestMetricsCollector();
    collector.recordResult('test-1', 'suite-a', 'pass', 100);
    expect(collector.snapshot().totalTests).toBe(1);
  });

  it('should track execution time', () => {
    const collector = createTestMetricsCollector();
    collector.recordResult('test-1', 'suite-a', 'pass', 50);
    collector.recordResult('test-2', 'suite-a', 'pass', 150);
    expect(collector.getAvgDuration()).toBe(100);
  });

  it('should calculate flakiness rate', () => {
    const collector = createTestMetricsCollector();
    collector.recordResult('flaky', 'suite-a', 'pass', 10);
    collector.recordResult('flaky', 'suite-a', 'fail', 10);
    collector.recordResult('flaky', 'suite-a', 'pass', 10);
    expect(collector.getFlakinessRate('flaky')).toBe(1);
  });

  it('should return 0 flakiness for stable tests', () => {
    const collector = createTestMetricsCollector();
    collector.recordResult('stable', 'suite-a', 'pass', 10);
    collector.recordResult('stable', 'suite-a', 'pass', 10);
    expect(collector.getFlakinessRate('stable')).toBe(0);
  });

  it('should track coverage trend', () => {
    const collector = createTestMetricsCollector();
    collector.recordCoverage(70);
    collector.recordCoverage(75);
    collector.recordCoverage(80);
    expect(collector.getCoverageTrend()).toHaveLength(3);
    expect(collector.getCoverageTrend()[2].percentage).toBe(80);
  });

  it('should find slowest tests', () => {
    const collector = createTestMetricsCollector();
    collector.recordResult('fast', 'suite', 'pass', 10);
    collector.recordResult('slow', 'suite', 'pass', 500);
    collector.recordResult('medium', 'suite', 'pass', 100);
    const slowest = collector.getSlowestTests(2);
    expect(slowest[0].name).toBe('slow');
    expect(slowest[0].durationMs).toBe(500);
    expect(slowest).toHaveLength(2);
  });

  it('should compute suite breakdown', () => {
    const collector = createTestMetricsCollector();
    collector.recordResult('t1', 'auth', 'pass', 10);
    collector.recordResult('t2', 'auth', 'fail', 20);
    collector.recordResult('t3', 'api', 'pass', 15);
    const breakdown = collector.getSuiteBreakdown();
    expect(breakdown['auth'].pass).toBe(1);
    expect(breakdown['auth'].fail).toBe(1);
    expect(breakdown['api'].pass).toBe(1);
  });

  it('should categorize failures by suite', () => {
    const collector = createTestMetricsCollector();
    collector.recordResult('t1', 'auth', 'fail', 10);
    collector.recordResult('t2', 'api', 'fail', 20);
    collector.recordResult('t3', 'api', 'pass', 15);
    const failures = collector.getFailureCategories();
    expect(failures['auth']).toContain('t1');
    expect(failures['api']).toContain('t2');
    expect(failures['api']).not.toContain('t3');
  });

  it('should reset all data', () => {
    const collector = createTestMetricsCollector();
    collector.recordResult('t1', 'suite', 'pass', 10);
    collector.recordCoverage(80);
    collector.reset();
    expect(collector.snapshot().totalTests).toBe(0);
    expect(collector.getCoverageTrend()).toHaveLength(0);
  });
});
