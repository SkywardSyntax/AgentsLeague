// Render Metrics Collector — canvas rendering observability
export interface FrameRecord {
  frameTime: number;
  drawCount: number;
  elementCount: number;
  timestamp: number;
}

export interface RenderMetricsSnapshot {
  totalFrames: number;
  avgFrameTime: number;
  avgDrawCount: number;
  avgElementCount: number;
  fps: number;
  slowFrames: number;
  maxFrameTime: number;
}

export interface RenderMetricsCollector {
  recordFrame(frameTime: number, drawCount: number, elementCount: number): void;
  getFps(windowMs?: number): number;
  getRollingAverage(field: keyof Pick<FrameRecord, 'frameTime' | 'drawCount' | 'elementCount'>, windowSize?: number): number;
  getSlowFrameCount(thresholdMs?: number): number;
  snapshot(): RenderMetricsSnapshot;
  reset(): void;
  getFrames(): readonly FrameRecord[];
}

export function createRenderMetricsCollector(): RenderMetricsCollector {
  let frames: FrameRecord[] = [];

  return {
    recordFrame(frameTime: number, drawCount: number, elementCount: number): void {
      frames.push({ frameTime, drawCount, elementCount, timestamp: Date.now() });
    },

    getFps(windowMs = 1000): number {
      if (frames.length === 0) return 0;
      const now = frames[frames.length - 1].timestamp;
      const windowStart = now - windowMs;
      const windowFrames = frames.filter(f => f.timestamp >= windowStart);
      if (windowFrames.length < 2) return windowFrames.length > 0 ? 1 : 0;
      const elapsed = windowFrames[windowFrames.length - 1].timestamp - windowFrames[0].timestamp;
      return elapsed > 0 ? (windowFrames.length / elapsed) * 1000 : 0;
    },

    getRollingAverage(field, windowSize = 10): number {
      if (frames.length === 0) return 0;
      const window = frames.slice(-windowSize);
      const sum = window.reduce((acc, f) => acc + f[field], 0);
      return sum / window.length;
    },

    getSlowFrameCount(thresholdMs = 16.67): number {
      return frames.filter(f => f.frameTime > thresholdMs).length;
    },

    snapshot(): RenderMetricsSnapshot {
      if (frames.length === 0) {
        return { totalFrames: 0, avgFrameTime: 0, avgDrawCount: 0, avgElementCount: 0, fps: 0, slowFrames: 0, maxFrameTime: 0 };
      }
      const total = frames.length;
      const avgFrameTime = frames.reduce((s, f) => s + f.frameTime, 0) / total;
      const avgDrawCount = frames.reduce((s, f) => s + f.drawCount, 0) / total;
      const avgElementCount = frames.reduce((s, f) => s + f.elementCount, 0) / total;
      const maxFrameTime = Math.max(...frames.map(f => f.frameTime));
      return {
        totalFrames: total,
        avgFrameTime,
        avgDrawCount,
        avgElementCount,
        fps: this.getFps(),
        slowFrames: this.getSlowFrameCount(),
        maxFrameTime,
      };
    },

    reset(): void {
      frames = [];
    },

    getFrames(): readonly FrameRecord[] {
      return frames;
    },
  };
}
