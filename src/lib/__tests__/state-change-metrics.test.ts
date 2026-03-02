import { describe, it, expect } from 'vitest';
import { createStateChangeMetrics } from '@/lib/state/state-change-metrics';

describe('StateChangeMetrics', () => {
  it('should start with empty state', () => {
    const metrics = createStateChangeMetrics();
    expect(metrics.getActions()).toHaveLength(0);
    expect(metrics.snapshot().totalActions).toBe(0);
  });

  it('should record an action', () => {
    const metrics = createStateChangeMetrics();
    metrics.recordAction('SET_USER', 1024);
    expect(metrics.getActions()).toHaveLength(1);
    expect(metrics.getActions()[0].actionType).toBe('SET_USER');
  });

  it('should track action frequency', () => {
    const metrics = createStateChangeMetrics();
    metrics.recordAction('A', 100);
    metrics.recordAction('B', 200);
    const freq = metrics.getActionFrequency();
    expect(freq).toBeGreaterThanOrEqual(0);
  });

  it('should measure average state size', () => {
    const metrics = createStateChangeMetrics();
    metrics.recordAction('A', 100);
    metrics.recordAction('B', 300);
    expect(metrics.getAvgStateSize()).toBe(200);
  });

  it('should track persistence timing', () => {
    const metrics = createStateChangeMetrics();
    metrics.recordAction('SAVE', 500, 15);
    metrics.recordAction('SAVE', 600, 25);
    expect(metrics.getAvgPersistTime()).toBe(20);
  });

  it('should compute action distribution', () => {
    const metrics = createStateChangeMetrics();
    metrics.recordAction('SET', 100);
    metrics.recordAction('SET', 200);
    metrics.recordAction('DELETE', 150);
    const dist = metrics.getActionDistribution();
    expect(dist['SET']).toBe(2);
    expect(dist['DELETE']).toBe(1);
  });

  it('should calculate state growth rate', () => {
    const metrics = createStateChangeMetrics();
    metrics.recordAction('A', 100);
    metrics.recordAction('B', 200);
    expect(metrics.getGrowthRate()).toBe(100);
  });

  it('should detect hotspots', () => {
    const metrics = createStateChangeMetrics();
    for (let i = 0; i < 10; i++) metrics.recordAction('HOT', 100);
    metrics.recordAction('COLD', 100);
    const hotspots = metrics.getHotspots(1.5);
    expect(hotspots).toContain('HOT');
    expect(hotspots).not.toContain('COLD');
  });

  it('should produce a valid snapshot', () => {
    const metrics = createStateChangeMetrics();
    metrics.recordAction('SET', 100, 10);
    metrics.recordAction('GET', 200);
    const snap = metrics.snapshot();
    expect(snap.totalActions).toBe(2);
    expect(snap.avgStateSize).toBe(150);
    expect(snap.avgPersistTime).toBe(10);
  });

  it('should reset all data', () => {
    const metrics = createStateChangeMetrics();
    metrics.recordAction('SET', 100);
    metrics.reset();
    expect(metrics.getActions()).toHaveLength(0);
    expect(metrics.getAvgStateSize()).toBe(0);
  });
});
