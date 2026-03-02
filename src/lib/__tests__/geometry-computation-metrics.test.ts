import { describe, it, expect } from 'vitest';
import { createGeometryComputationMetrics } from '@/lib/whiteboard/geometry-computation-metrics';

describe('GeometryComputationMetrics', () => {
  it('should start with empty state', () => {
    const metrics = createGeometryComputationMetrics();
    expect(metrics.getOperations()).toHaveLength(0);
    expect(metrics.snapshot().totalOperations).toBe(0);
  });

  it('should record a computation', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('intersection', 5, 100, 50, false);
    expect(metrics.getOperations()).toHaveLength(1);
    expect(metrics.getAvgCalcTime()).toBe(5);
  });

  it('should track complexity via vertex*edge product', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('transform', 10, 200, 100, false);
    expect(metrics.getComplexityScore()).toBe((200 * 100) / 1000);
  });

  it('should compute cache hit ratio', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('lookup', 1, 10, 5, true);
    metrics.recordOperation('lookup', 1, 10, 5, true);
    metrics.recordOperation('compute', 10, 50, 25, false);
    expect(metrics.getCacheHitRatio()).toBeCloseTo(2 / 3);
  });

  it('should track vertex count', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('a', 1, 100, 10, false);
    metrics.recordOperation('b', 2, 200, 20, false);
    expect(metrics.getAvgVertexCount()).toBe(150);
  });

  it('should track edge count', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('a', 1, 10, 50, false);
    metrics.recordOperation('b', 2, 20, 100, false);
    expect(metrics.getAvgEdgeCount()).toBe(75);
  });

  it('should measure spatial index performance', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('spatial_index', 3, 50, 25, false);
    metrics.recordOperation('spatial_index', 7, 100, 50, false);
    metrics.recordOperation('intersection', 5, 80, 40, false);
    const spatial = metrics.getSpatialIndexPerformance();
    expect(spatial.count).toBe(2);
    expect(spatial.avgTime).toBe(5);
  });

  it('should compute batch stats', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('a', 10, 10, 5, false);
    metrics.recordOperation('b', 20, 20, 10, false);
    metrics.recordOperation('c', 30, 30, 15, false);
    const batch = metrics.getBatchStats(2);
    expect(batch.count).toBe(2);
    expect(batch.avgTime).toBe(25);
  });

  it('should produce a valid snapshot', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('transform', 10, 100, 50, true);
    const snap = metrics.snapshot();
    expect(snap.totalOperations).toBe(1);
    expect(snap.avgCalcTime).toBe(10);
    expect(snap.cacheHitRatio).toBe(1);
  });

  it('should reset all data', () => {
    const metrics = createGeometryComputationMetrics();
    metrics.recordOperation('a', 10, 100, 50, false);
    metrics.reset();
    expect(metrics.getOperations()).toHaveLength(0);
    expect(metrics.getAvgCalcTime()).toBe(0);
  });
});
