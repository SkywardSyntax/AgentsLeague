// State Change Metrics — action and persistence observability
export interface ActionRecord {
  actionType: string;
  stateSizeBytes: number;
  persistTimeMs?: number;
  timestamp: number;
}

export interface StateChangeMetricsSnapshot {
  totalActions: number;
  actionFrequency: number;
  avgStateSize: number;
  avgPersistTime: number;
  actionDistribution: Record<string, number>;
  growthRate: number;
  hotspots: string[];
}

export interface StateChangeMetrics {
  recordAction(actionType: string, stateSizeBytes: number, persistTimeMs?: number): void;
  getActionFrequency(): number;
  getAvgStateSize(): number;
  getAvgPersistTime(): number;
  getActionDistribution(): Record<string, number>;
  getGrowthRate(): number;
  getHotspots(threshold?: number): string[];
  snapshot(): StateChangeMetricsSnapshot;
  reset(): void;
  getActions(): readonly ActionRecord[];
}

export function createStateChangeMetrics(): StateChangeMetrics {
  let actions: ActionRecord[] = [];

  return {
    recordAction(actionType, stateSizeBytes, persistTimeMs): void {
      actions.push({ actionType, stateSizeBytes, persistTimeMs, timestamp: Date.now() });
    },

    getActionFrequency(): number {
      if (actions.length < 2) return 0;
      const durationSec = (actions[actions.length - 1].timestamp - actions[0].timestamp) / 1000;
      return durationSec > 0 ? actions.length / durationSec : 0;
    },

    getAvgStateSize(): number {
      if (actions.length === 0) return 0;
      return actions.reduce((s, a) => s + a.stateSizeBytes, 0) / actions.length;
    },

    getAvgPersistTime(): number {
      const persisted = actions.filter(a => a.persistTimeMs !== undefined);
      if (persisted.length === 0) return 0;
      return persisted.reduce((s, a) => s + a.persistTimeMs!, 0) / persisted.length;
    },

    getActionDistribution(): Record<string, number> {
      const dist: Record<string, number> = {};
      for (const a of actions) {
        dist[a.actionType] = (dist[a.actionType] ?? 0) + 1;
      }
      return dist;
    },

    getGrowthRate(): number {
      if (actions.length < 2) return 0;
      const first = actions[0].stateSizeBytes;
      const last = actions[actions.length - 1].stateSizeBytes;
      return first > 0 ? ((last - first) / first) * 100 : 0;
    },

    getHotspots(threshold = 3): string[] {
      const dist = this.getActionDistribution();
      const avg = actions.length / Math.max(Object.keys(dist).length, 1);
      return Object.entries(dist)
        .filter(([, count]) => count >= avg * threshold)
        .map(([type]) => type);
    },

    snapshot(): StateChangeMetricsSnapshot {
      return {
        totalActions: actions.length,
        actionFrequency: this.getActionFrequency(),
        avgStateSize: this.getAvgStateSize(),
        avgPersistTime: this.getAvgPersistTime(),
        actionDistribution: this.getActionDistribution(),
        growthRate: this.getGrowthRate(),
        hotspots: this.getHotspots(),
      };
    },

    reset(): void {
      actions = [];
    },

    getActions(): readonly ActionRecord[] {
      return actions;
    },
  };
}
