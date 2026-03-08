interface OperationRecord {
  name: string;
  calcTime: number;
  vertexCount: number;
  edgeCount: number;
  cacheHit: boolean;
}

interface Snapshot {
  totalOperations: number;
  avgCalcTime: number;
  cacheHitRatio: number;
}

export function createGeometryComputationMetrics() {
  let operations: OperationRecord[] = [];

  return {
    recordOperation(name: string, calcTime: number, vertexCount: number, edgeCount: number, cacheHit: boolean) {
      operations.push({ name, calcTime, vertexCount, edgeCount, cacheHit });
    },

    getOperations() {
      return operations;
    },

    getAvgCalcTime(): number {
      if (operations.length === 0) return 0;
      return operations.reduce((sum, op) => sum + op.calcTime, 0) / operations.length;
    },

    getComplexityScore(): number {
      if (operations.length === 0) return 0;
      const last = operations[operations.length - 1]!;
      return (last.vertexCount * last.edgeCount) / 1000;
    },

    getCacheHitRatio(): number {
      if (operations.length === 0) return 0;
      return operations.filter((op) => op.cacheHit).length / operations.length;
    },

    getAvgVertexCount(): number {
      if (operations.length === 0) return 0;
      return operations.reduce((sum, op) => sum + op.vertexCount, 0) / operations.length;
    },

    getAvgEdgeCount(): number {
      if (operations.length === 0) return 0;
      return operations.reduce((sum, op) => sum + op.edgeCount, 0) / operations.length;
    },

    getSpatialIndexPerformance(): { count: number; avgTime: number } {
      const spatial = operations.filter((op) => op.name === 'spatial_index');
      if (spatial.length === 0) return { count: 0, avgTime: 0 };
      return {
        count: spatial.length,
        avgTime: spatial.reduce((sum, op) => sum + op.calcTime, 0) / spatial.length,
      };
    },

    getBatchStats(lastN: number): { count: number; avgTime: number } {
      const batch = operations.slice(-lastN);
      if (batch.length === 0) return { count: 0, avgTime: 0 };
      return {
        count: batch.length,
        avgTime: batch.reduce((sum, op) => sum + op.calcTime, 0) / batch.length,
      };
    },

    snapshot(): Snapshot {
      return {
        totalOperations: operations.length,
        avgCalcTime: operations.length === 0 ? 0 : operations.reduce((sum, op) => sum + op.calcTime, 0) / operations.length,
        cacheHitRatio: operations.length === 0 ? 0 : operations.filter((op) => op.cacheHit).length / operations.length,
      };
    },

    reset() {
      operations = [];
    },
  };
}
