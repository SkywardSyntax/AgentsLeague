import { describe, it, expect } from 'vitest';
import { createLatexMetrics } from '@/lib/latex/latex-metrics';

describe('LatexMetrics', () => {
  it('should start with empty state', () => {
    const metrics = createLatexMetrics();
    const snap = metrics.snapshot();
    expect(snap.totalCompilations).toBe(0);
    expect(snap.avgCompileTime).toBe(0);
  });

  it('should record compile time', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(45, false, 3);
    expect(metrics.getAvgCompileTime()).toBe(45);
  });

  it('should compute cache hit ratio', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(10, true, 1);
    metrics.recordCompilation(50, false, 2);
    metrics.recordCompilation(5, true, 1);
    expect(metrics.getCacheHitRatio()).toBeCloseTo(2 / 3);
  });

  it('should track cache misses', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(50, false, 2);
    metrics.recordCompilation(60, false, 3);
    expect(metrics.getCacheHitRatio()).toBe(0);
  });

  it('should compute error frequency', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(20, false, 1, 'syntax');
    metrics.recordCompilation(30, true, 2);
    expect(metrics.getErrorFrequency()).toBe(0.5);
  });

  it('should calculate complexity score', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(20, false, 5);
    metrics.recordCompilation(30, false, 10);
    expect(metrics.getComplexityScore()).toBe(7.5);
  });

  it('should compute pipeline latency from uncached only', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(10, true, 1);
    metrics.recordCompilation(50, false, 3);
    metrics.recordCompilation(70, false, 5);
    expect(metrics.getPipelineLatency()).toBe(60);
  });

  it('should group errors by type', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(20, false, 1, 'syntax');
    metrics.recordCompilation(30, false, 2, 'syntax');
    metrics.recordCompilation(40, false, 3, 'render');
    const errors = metrics.getErrorsByType();
    expect(errors['syntax']).toBe(2);
    expect(errors['render']).toBe(1);
  });

  it('should compute batch stats', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(10, true, 1);
    metrics.recordCompilation(20, false, 2);
    metrics.recordCompilation(30, true, 3);
    const batch = metrics.getBatchStats(2);
    expect(batch.count).toBe(2);
    expect(batch.avgTime).toBe(25);
    expect(batch.cacheRatio).toBe(0.5);
  });

  it('should reset all data', () => {
    const metrics = createLatexMetrics();
    metrics.recordCompilation(20, false, 1);
    metrics.reset();
    expect(metrics.snapshot().totalCompilations).toBe(0);
    expect(metrics.getAvgCompileTime()).toBe(0);
  });
});
