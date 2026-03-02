import { describe, it, expect } from 'vitest';
import { createUIPerformanceMetrics } from '@/lib/client/ui-performance-metrics';

describe('UIPerformanceMetrics', () => {
  it('should start with empty state', () => {
    const metrics = createUIPerformanceMetrics();
    expect(metrics.snapshot().totalRecords).toBe(0);
  });

  it('should record FCP', () => {
    const metrics = createUIPerformanceMetrics();
    metrics.record('FCP', 1200);
    expect(metrics.getAverage('FCP')).toBe(1200);
  });

  it('should record LCP', () => {
    const metrics = createUIPerformanceMetrics();
    metrics.record('LCP', 2000);
    metrics.record('LCP', 3000);
    expect(metrics.getAverage('LCP')).toBe(2500);
  });

  it('should record CLS', () => {
    const metrics = createUIPerformanceMetrics();
    metrics.record('CLS', 0.05);
    metrics.record('CLS', 0.15);
    expect(metrics.getAverage('CLS')).toBeCloseTo(0.1);
  });

  it('should record INP', () => {
    const metrics = createUIPerformanceMetrics();
    metrics.record('INP', 150);
    expect(metrics.getAverage('INP')).toBe(150);
  });

  it('should compute performance score', () => {
    const metrics = createUIPerformanceMetrics();
    metrics.record('FCP', 1000);
    metrics.record('LCP', 1500);
    metrics.record('CLS', 0.05);
    metrics.record('INP', 100);
    const score = metrics.getPerformanceScore();
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should detect regressions', () => {
    const metrics = createUIPerformanceMetrics();
    // baseline: low values
    for (let i = 0; i < 5; i++) metrics.record('FCP', 500);
    // recent: much higher
    for (let i = 0; i < 5; i++) metrics.record('FCP', 2000);
    const regressions = metrics.detectRegressions(5);
    expect(regressions).toContain('FCP');
  });

  it('should compute percentiles', () => {
    const metrics = createUIPerformanceMetrics();
    for (let i = 1; i <= 100; i++) metrics.record('LCP', i * 10);
    const p50 = metrics.getPercentile('LCP', 50);
    const p95 = metrics.getPercentile('LCP', 95);
    expect(p50).toBeLessThanOrEqual(p95);
    expect(p50).toBeGreaterThan(0);
  });

  it('should provide page breakdown', () => {
    const metrics = createUIPerformanceMetrics();
    metrics.record('FCP', 1000, '/home');
    metrics.record('LCP', 2000, '/home');
    metrics.record('FCP', 1500, '/about');
    const home = metrics.getPageBreakdown('/home');
    expect(home.FCP).toBe(1000);
    expect(home.LCP).toBe(2000);
    const about = metrics.getPageBreakdown('/about');
    expect(about.FCP).toBe(1500);
  });

  it('should reset all data', () => {
    const metrics = createUIPerformanceMetrics();
    metrics.record('FCP', 1000);
    metrics.record('LCP', 2000);
    metrics.reset();
    expect(metrics.snapshot().totalRecords).toBe(0);
    expect(metrics.getAverage('FCP')).toBe(0);
  });
});
