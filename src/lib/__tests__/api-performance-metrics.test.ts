import { describe, it, expect } from 'vitest';
import { createAPIPerformanceMetrics } from '@/lib/server/api-performance-metrics';

describe('APIPerformanceMetrics', () => {
  it('should start with empty state', () => {
    const metrics = createAPIPerformanceMetrics();
    expect(metrics.snapshot().totalRequests).toBe(0);
    expect(metrics.getAvgResponseTime()).toBe(0);
  });

  it('should record a request', () => {
    const metrics = createAPIPerformanceMetrics();
    metrics.recordRequest('/api/users', 'GET', 200, 50);
    expect(metrics.snapshot().totalRequests).toBe(1);
    expect(metrics.getAvgResponseTime()).toBe(50);
  });

  it('should compute throughput', () => {
    const metrics = createAPIPerformanceMetrics();
    metrics.recordRequest('/api/a', 'GET', 200, 10);
    metrics.recordRequest('/api/b', 'GET', 200, 20);
    const throughput = metrics.getThroughput();
    expect(throughput).toBeGreaterThanOrEqual(0);
  });

  it('should calculate error rate', () => {
    const metrics = createAPIPerformanceMetrics();
    metrics.recordRequest('/api/a', 'GET', 200, 10);
    metrics.recordRequest('/api/b', 'GET', 500, 20);
    expect(metrics.getErrorRate()).toBe(0.5);
  });

  it('should compute per-endpoint error rate', () => {
    const metrics = createAPIPerformanceMetrics();
    metrics.recordRequest('/api/a', 'GET', 200, 10);
    metrics.recordRequest('/api/a', 'GET', 500, 20);
    metrics.recordRequest('/api/b', 'GET', 200, 10);
    expect(metrics.getErrorRate('/api/a')).toBe(0.5);
    expect(metrics.getErrorRate('/api/b')).toBe(0);
  });

  it('should compute status distribution', () => {
    const metrics = createAPIPerformanceMetrics();
    metrics.recordRequest('/a', 'GET', 200, 10);
    metrics.recordRequest('/b', 'GET', 200, 10);
    metrics.recordRequest('/c', 'GET', 404, 10);
    metrics.recordRequest('/d', 'POST', 500, 10);
    const dist = metrics.getStatusDistribution();
    expect(dist[200]).toBe(2);
    expect(dist[404]).toBe(1);
    expect(dist[500]).toBe(1);
  });

  it('should compute latency percentiles', () => {
    const metrics = createAPIPerformanceMetrics();
    for (let i = 1; i <= 100; i++) {
      metrics.recordRequest('/api/test', 'GET', 200, i);
    }
    const p50 = metrics.getLatencyPercentile(50);
    const p99 = metrics.getLatencyPercentile(99);
    expect(p50).toBeLessThanOrEqual(p99);
    expect(p50).toBeGreaterThan(0);
  });

  it('should detect slow endpoints', () => {
    const metrics = createAPIPerformanceMetrics();
    metrics.recordRequest('/api/fast', 'GET', 200, 50);
    metrics.recordRequest('/api/slow', 'GET', 200, 800);
    const slow = metrics.getSlowEndpoints(500);
    expect(slow).toHaveLength(1);
    expect(slow[0].endpoint).toBe('/api/slow');
  });

  it('should track rate limit hits', () => {
    const metrics = createAPIPerformanceMetrics();
    metrics.recordRequest('/api/a', 'GET', 429, 10);
    metrics.recordRequest('/api/b', 'GET', 429, 10);
    metrics.recordRequest('/api/c', 'GET', 200, 10);
    expect(metrics.getRateLimitHits()).toBe(2);
  });

  it('should reset all data', () => {
    const metrics = createAPIPerformanceMetrics();
    metrics.recordRequest('/api/a', 'GET', 200, 10);
    metrics.reset();
    expect(metrics.snapshot().totalRequests).toBe(0);
    expect(metrics.getAvgResponseTime()).toBe(0);
  });
});
