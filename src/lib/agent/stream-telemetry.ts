// Stream Telemetry — stream health and performance tracking
export interface ChunkRecord {
  latencyMs: number;
  sizeBytes: number;
  timestamp: number;
  error?: boolean;
}

export interface StreamSession {
  startTime: number;
  endTime?: number;
  reconnections: number;
  chunks: ChunkRecord[];
}

export interface StreamTelemetrySnapshot {
  totalChunks: number;
  avgLatency: number;
  throughputBytesPerSec: number;
  errorRate: number;
  totalSessions: number;
  avgReconnections: number;
  qualityScore: number;
}

export interface StreamTelemetry {
  startSession(): number;
  endSession(sessionId: number): void;
  recordChunk(sessionId: number, latencyMs: number, sizeBytes: number, error?: boolean): void;
  recordReconnection(sessionId: number): void;
  getAvgLatency(): number;
  getThroughput(): number;
  getErrorRate(): number;
  getQualityScore(): number;
  isDegraded(latencyThreshold?: number, errorThreshold?: number): boolean;
  snapshot(): StreamTelemetrySnapshot;
  reset(): void;
}

export function createStreamTelemetry(): StreamTelemetry {
  let sessions: StreamSession[] = [];

  function allChunks(): ChunkRecord[] {
    return sessions.flatMap(s => s.chunks);
  }

  return {
    startSession(): number {
      const id = sessions.length;
      sessions.push({ startTime: Date.now(), reconnections: 0, chunks: [] });
      return id;
    },

    endSession(sessionId): void {
      if (sessions[sessionId]) sessions[sessionId].endTime = Date.now();
    },

    recordChunk(sessionId, latencyMs, sizeBytes, error = false): void {
      if (sessions[sessionId]) {
        sessions[sessionId].chunks.push({ latencyMs, sizeBytes, timestamp: Date.now(), error });
      }
    },

    recordReconnection(sessionId): void {
      if (sessions[sessionId]) sessions[sessionId].reconnections++;
    },

    getAvgLatency(): number {
      const chunks = allChunks();
      if (chunks.length === 0) return 0;
      return chunks.reduce((s, c) => s + c.latencyMs, 0) / chunks.length;
    },

    getThroughput(): number {
      const chunks = allChunks();
      if (chunks.length < 2) return 0;
      const totalBytes = chunks.reduce((s, c) => s + c.sizeBytes, 0);
      const elapsed = (chunks[chunks.length - 1].timestamp - chunks[0].timestamp) / 1000;
      return elapsed > 0 ? totalBytes / elapsed : 0;
    },

    getErrorRate(): number {
      const chunks = allChunks();
      if (chunks.length === 0) return 0;
      return chunks.filter(c => c.error).length / chunks.length;
    },

    getQualityScore(): number {
      const errorRate = this.getErrorRate();
      const avgLatency = this.getAvgLatency();
      const reconnections = sessions.reduce((s, sess) => s + sess.reconnections, 0);
      return Math.max(0, 100 - errorRate * 100 - (avgLatency > 50 ? (avgLatency - 50) / 5 : 0) - reconnections * 5);
    },

    isDegraded(latencyThreshold = 200, errorThreshold = 0.1): boolean {
      return this.getAvgLatency() > latencyThreshold || this.getErrorRate() > errorThreshold;
    },

    snapshot(): StreamTelemetrySnapshot {
      return {
        totalChunks: allChunks().length,
        avgLatency: this.getAvgLatency(),
        throughputBytesPerSec: this.getThroughput(),
        errorRate: this.getErrorRate(),
        totalSessions: sessions.length,
        avgReconnections: sessions.length > 0 ? sessions.reduce((s, sess) => s + sess.reconnections, 0) / sessions.length : 0,
        qualityScore: this.getQualityScore(),
      };
    },

    reset(): void {
      sessions = [];
    },
  };
}
