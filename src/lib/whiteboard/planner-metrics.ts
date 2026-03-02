// Planner Metrics — planning performance observability
export interface PlanRecord {
  planningTimeMs: number;
  iterationCount: number;
  constraintViolations: number;
  timestamp: number;
}

export interface PlannerMetricsSnapshot {
  totalPlans: number;
  avgPlanningTime: number;
  avgIterations: number;
  avgViolations: number;
  worstPlanningTime: number;
  qualityScore: number;
}

export interface PlannerMetrics {
  recordPlan(planningTimeMs: number, iterationCount: number, constraintViolations: number): void;
  getQualityScore(): number;
  getWorstPlanningTime(): number;
  getAveragePlanningTime(): number;
  getAverageIterations(): number;
  getAverageViolations(): number;
  comparePlans(indexA: number, indexB: number): { faster: number; fewerViolations: number };
  snapshot(): PlannerMetricsSnapshot;
  reset(): void;
  getPlans(): readonly PlanRecord[];
}

export function createPlannerMetrics(): PlannerMetrics {
  let plans: PlanRecord[] = [];

  function avg(fn: (p: PlanRecord) => number): number {
    if (plans.length === 0) return 0;
    return plans.reduce((s, p) => s + fn(p), 0) / plans.length;
  }

  return {
    recordPlan(planningTimeMs, iterationCount, constraintViolations): void {
      plans.push({ planningTimeMs, iterationCount, constraintViolations, timestamp: Date.now() });
    },

    getQualityScore(): number {
      if (plans.length === 0) return 0;
      const avgViol = avg(p => p.constraintViolations);
      const avgTime = avg(p => p.planningTimeMs);
      // Score: 100 minus penalties for violations and slow time
      return Math.max(0, 100 - avgViol * 10 - (avgTime > 100 ? (avgTime - 100) / 10 : 0));
    },

    getWorstPlanningTime(): number {
      if (plans.length === 0) return 0;
      return Math.max(...plans.map(p => p.planningTimeMs));
    },

    getAveragePlanningTime(): number {
      return avg(p => p.planningTimeMs);
    },

    getAverageIterations(): number {
      return avg(p => p.iterationCount);
    },

    getAverageViolations(): number {
      return avg(p => p.constraintViolations);
    },

    comparePlans(indexA, indexB) {
      const a = plans[indexA];
      const b = plans[indexB];
      if (!a || !b) return { faster: -1, fewerViolations: -1 };
      return {
        faster: a.planningTimeMs <= b.planningTimeMs ? indexA : indexB,
        fewerViolations: a.constraintViolations <= b.constraintViolations ? indexA : indexB,
      };
    },

    snapshot(): PlannerMetricsSnapshot {
      return {
        totalPlans: plans.length,
        avgPlanningTime: this.getAveragePlanningTime(),
        avgIterations: this.getAverageIterations(),
        avgViolations: this.getAverageViolations(),
        worstPlanningTime: this.getWorstPlanningTime(),
        qualityScore: this.getQualityScore(),
      };
    },

    reset(): void {
      plans = [];
    },

    getPlans(): readonly PlanRecord[] {
      return plans;
    },
  };
}
