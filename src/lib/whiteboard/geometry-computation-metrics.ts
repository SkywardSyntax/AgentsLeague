// Geometry Computation Metrics — spatial computation observability
export interface GeometryRecord {
  operationType: string;
  timeMs: number;
  vertexCount: number;
  edgeCount: number;
  cached: boolean;
  timestamp: number;
}

export interface GeometryMetricsSnapshot {
  totalOperations: number;
  avgCalcTime: number;
  cacheHitRatio: number;
  avgVertexCount: number;
  avgEdgeCount: number;
  complexityScore: number;
  batchAvgTime: number;
}

export interface GeometryComputationMetrics {
  recordOperation(operationType: string, timeMs: number, vertexCount: number, edgeCount: number, cached: boolean): void;
  getAvgCalcTime(): number;
  getCacheHitRatio(): number;
  getAvgVertexCount(): number;
  getAvgEdgeCount(): number;
  getComplexityScore(): number;
  getSpatialIndexPerformance(): { avgTime: number; count: number };
  getBatchStats(lastN?: number): { count: number; avgTime: number };
  snapshot(): GeometryMetricsSnapshot;
  reset(): void;
  getOperations(): readonly GeometryRecord[];
}

export function createGeometryComputationMetrics(): GeometryComputationMetrics {
  let records: GeometryRecord[] = [];

  return {
    recordOperation(operationType, timeMs, vertexCount, edgeCount, cached): void {
      records.push({ operationType, timeMs, vertexCount, edgeCount, cached, timestamp: Date.now() });
    },

    getAvgCalcTime(): number {
      if (records.length === 0) return 0;
      return records.reduce((s, r) => s + r.timeMs, 0) / records.length;
    },

    getCacheHitRatio(): number {
      if (records.length === 0) return 0;
      return records.filter(r => r.cached).length / records.length;
    },

    getAvgVertexCount(): number {
      if (records.length === 0) return 0;
      return records.reduce((s, r) => s + r.vertexCount, 0) / records.length;
    },

    getAvgEdgeCount(): number {
      if (records.length === 0) return 0;
      return records.reduce((s, r) => s + r.edgeCount, 0) / records.length;
    },

    getComplexityScore(): number {
      if (records.length === 0) return 0;
      return records.reduce((s, r) => s + (r.vertexCount * r.edgeCount) / 1000, 0) / records.length;
    },

    getSpatialIndexPerformance(): { avgTime: number; count: number } {
      const spatial = records.filter(r => r.operationType === 'spatial_index');
      if (spatial.length === 0) return { avgTime: 0, count: 0 };
      return {
        avgTime: spatial.reduce((s, r) => s + r.timeMs, 0) / spatial.length,
        count: spatial.length,
      };
    },

    getBatchStats(lastN?: number) {
      const batch = lastN ? records.slice(-lastN) : records;
      if (batch.length === 0) return { count: 0, avgTime: 0 };
      return {
        count: batch.length,
        avgTime: batch.reduce((s, r) => s + r.timeMs, 0) / batch.length,
      };
    },

    snapshot(): GeometryMetricsSnapshot {
      return {
        totalOperations: records.length,
        avgCalcTime: this.getAvgCalcTime(),
        cacheHitRatio: this.getCacheHitRatio(),
        avgVertexCount: this.getAvgVertexCount(),
        avgEdgeCount: this.getAvgEdgeCount(),
        complexityScore: this.getComplexityScore(),
        batchAvgTime: this.getBatchStats().avgTime,
      };
    },

    reset(): void {
      records = [];
    },

    getOperations(): readonly GeometryRecord[] {
      return records;
    },
  };
}
