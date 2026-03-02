import { describe, it, expect } from 'vitest';
import { createPlannerMetrics } from '@/lib/whiteboard/planner-metrics';

describe('PlannerMetrics', () => {
  it('should start with empty state', () => {
    const metrics = createPlannerMetrics();
    expect(metrics.getPlans()).toHaveLength(0);
    expect(metrics.snapshot().totalPlans).toBe(0);
  });

  it('should record a plan', () => {
    const metrics = createPlannerMetrics();
    metrics.recordPlan(50, 3, 1);
    expect(metrics.getPlans()).toHaveLength(1);
    expect(metrics.getPlans()[0].planningTimeMs).toBe(50);
  });

  it('should track iteration count', () => {
    const metrics = createPlannerMetrics();
    metrics.recordPlan(50, 5, 0);
    metrics.recordPlan(80, 10, 2);
    expect(metrics.getAverageIterations()).toBe(7.5);
  });

  it('should count constraint violations', () => {
    const metrics = createPlannerMetrics();
    metrics.recordPlan(30, 2, 3);
    metrics.recordPlan(40, 3, 1);
    expect(metrics.getAverageViolations()).toBe(2);
  });

  it('should compute quality score', () => {
    const metrics = createPlannerMetrics();
    metrics.recordPlan(50, 3, 0);
    const score = metrics.getQualityScore();
    expect(score).toBe(100);
  });

  it('should penalize quality for violations', () => {
    const metrics = createPlannerMetrics();
    metrics.recordPlan(50, 3, 5);
    const score = metrics.getQualityScore();
    expect(score).toBe(50);
  });

  it('should return worst planning time', () => {
    const metrics = createPlannerMetrics();
    metrics.recordPlan(50, 3, 0);
    metrics.recordPlan(200, 10, 2);
    metrics.recordPlan(80, 5, 1);
    expect(metrics.getWorstPlanningTime()).toBe(200);
  });

  it('should aggregate multiple plans', () => {
    const metrics = createPlannerMetrics();
    for (let i = 0; i < 5; i++) {
      metrics.recordPlan(20 + i * 10, i + 1, i);
    }
    const snap = metrics.snapshot();
    expect(snap.totalPlans).toBe(5);
    expect(snap.avgPlanningTime).toBe(40);
    expect(snap.avgIterations).toBe(3);
  });

  it('should compare two plans', () => {
    const metrics = createPlannerMetrics();
    metrics.recordPlan(50, 3, 2);
    metrics.recordPlan(30, 5, 4);
    const comparison = metrics.comparePlans(0, 1);
    expect(comparison.faster).toBe(1);
    expect(comparison.fewerViolations).toBe(0);
  });

  it('should reset all data', () => {
    const metrics = createPlannerMetrics();
    metrics.recordPlan(50, 3, 1);
    metrics.reset();
    expect(metrics.getPlans()).toHaveLength(0);
    expect(metrics.getQualityScore()).toBe(0);
  });
});
