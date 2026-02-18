/**
 * Performance metrics utilities — instruments the rendering pipeline
 * per PERFORMANCE_STRATEGY.md §6.
 *
 * Latency budgets:
 *  - TTFB (AI):       <400 ms P95
 *  - TTFS:            <600 ms P95
 *  - Render FPS:      ≥60 fps sustained
 *  - Frame budget:    <8 ms at 120 fps
 *  - E2E latency:     <3 s P95
 *  - Input latency:   <50 ms P99
 */

// ── Latency budgets ─────────────────────────────────────────────────

export const LATENCY_BUDGETS: Record<string, number> = {
  'ai-ttfb': 400,
  'time-to-first-shape': 600,
  'e2e-full-render': 3000,
  'input-latency': 50,
  'frame-budget': 8,
} as const;

// ── Mark / Measure helpers ──────────────────────────────────────────

const marks = new Map<string, number>();

export function perfStart(label: string): void {
  marks.set(label, performance.now());
}

export function perfEnd(label: string): number {
  const start = marks.get(label);
  if (start === undefined) return -1;
  const duration = performance.now() - start;
  marks.delete(label);

  const budget = LATENCY_BUDGETS[label];
  if (budget !== undefined && duration > budget) {
    console.warn(
      `[PERF] ${label}: ${duration.toFixed(1)}ms exceeds ${budget}ms budget`,
    );
  }

  return duration;
}

// ── Time to First Byte ──────────────────────────────────────────────

/**
 * Measure TTFB for a streaming fetch.
 * Returns the time in ms from request start to the first byte received.
 */
export async function measureTimeToFirstByte(
  url: string,
  init?: RequestInit,
): Promise<{ ttfb: number; response: Response }> {
  const start = performance.now();
  const response = await fetch(url, init);
  const ttfb = performance.now() - start;

  const budget = LATENCY_BUDGETS['ai-ttfb'];
  if (budget !== undefined && ttfb > budget) {
    console.warn(
      `[PERF] TTFB: ${ttfb.toFixed(1)}ms exceeds ${budget}ms budget`,
    );
  }

  return { ttfb, response };
}

// ── Frame time tracker ──────────────────────────────────────────────

export interface FrameMetrics {
  /** Current FPS (averaged over sample window). */
  readonly fps: number;
  /** Number of frames exceeding 50 ms in the sample window. */
  readonly droppedFrames: number;
  /** P95 frame time in ms. */
  readonly p95FrameTime: number;
  /** Average frame time in ms. */
  readonly avgFrameTime: number;
}

/**
 * Tracks frame timing via requestAnimationFrame.
 * Call `tick()` once per rAF callback to record frame deltas.
 */
export class FrameTimeTracker {
  private frameTimes: number[] = [];
  private lastTimestamp = 0;
  private readonly maxSamples: number;

  constructor(maxSamples = 120) {
    this.maxSamples = maxSamples;
  }

  /** Record a frame. Call inside your rAF loop. */
  tick(timestamp: number): void {
    if (this.lastTimestamp > 0) {
      const delta = timestamp - this.lastTimestamp;
      this.frameTimes.push(delta);
      if (this.frameTimes.length > this.maxSamples) {
        this.frameTimes.shift();
      }
    }
    this.lastTimestamp = timestamp;
  }

  /** Get current metrics snapshot. */
  getMetrics(): FrameMetrics {
    if (this.frameTimes.length === 0) {
      return { fps: 0, droppedFrames: 0, p95FrameTime: 0, avgFrameTime: 0 };
    }

    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index] ?? sorted[sorted.length - 1]!;

    return {
      fps: 1000 / avg,
      droppedFrames: this.frameTimes.filter((t) => t > 50).length,
      p95FrameTime: p95,
      avgFrameTime: avg,
    };
  }

  /** Reset all recorded samples. */
  reset(): void {
    this.frameTimes.length = 0;
    this.lastTimestamp = 0;
  }
}

// ── measureFrameTime (convenience) ──────────────────────────────────

/**
 * Measure a single frame's execution time.
 * Wraps a function and returns its duration in ms.
 */
export function measureFrameTime(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// ── Render percentile ───────────────────────────────────────────────

/**
 * Collect render durations and compute percentiles.
 */
export class RenderPercentileTracker {
  private durations: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 500) {
    this.maxSamples = maxSamples;
  }

  /** Record a render duration (ms). */
  record(durationMs: number): void {
    this.durations.push(durationMs);
    if (this.durations.length > this.maxSamples) {
      this.durations.shift();
    }
  }

  /** Measure a function's execution time and record it. */
  measure(fn: () => void): number {
    const duration = measureFrameTime(fn);
    this.record(duration);
    return duration;
  }

  /** Get the Nth percentile render time. */
  percentile(p: number): number {
    if (this.durations.length === 0) return 0;
    const sorted = [...this.durations].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * (p / 100));
    return sorted[Math.min(index, sorted.length - 1)]!;
  }

  /** Convenience: P50 / P95 / P99 snapshot. */
  snapshot(): { p50: number; p95: number; p99: number; count: number } {
    return {
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99),
      count: this.durations.length,
    };
  }

  reset(): void {
    this.durations.length = 0;
  }
}

/**
 * Convenience: compute a single percentile from an array of numbers.
 */
export function measureRenderPercentile(
  durations: readonly number[],
  p: number,
): number {
  if (durations.length === 0) return 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * (p / 100));
  return sorted[Math.min(index, sorted.length - 1)]!;
}

// ── Performance Observer wrapper ────────────────────────────────────

export interface PerfObserverOptions {
  /** Entry types to observe (e.g. 'longtask', 'measure', 'paint'). */
  entryTypes: string[];
  /** Callback invoked with each batch of entries. */
  onEntries: (entries: PerformanceEntryList) => void;
  /** Whether to buffer entries from before observation starts. */
  buffered?: boolean;
}

/**
 * Thin wrapper around PerformanceObserver with safe teardown.
 * Returns a disconnect function.
 */
export function createPerformanceObserver(
  options: PerfObserverOptions,
): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
  }

  const observer = new PerformanceObserver((list) => {
    options.onEntries(list.getEntries());
  });

  try {
    // Use 'type' for each entry type to enable buffered option
    for (const entryType of options.entryTypes) {
      observer.observe({
        type: entryType,
        buffered: options.buffered ?? false,
      });
    }
  } catch {
    // Fallback for browsers that don't support per-type observe
    try {
      observer.observe({ entryTypes: options.entryTypes });
    } catch {
      // PerformanceObserver not fully supported
    }
  }

  return () => observer.disconnect();
}

// ── Jank detector ───────────────────────────────────────────────────

/**
 * Detect jank (frames >50 ms) using Long Animation Frame API or
 * fallback to rAF delta tracking.
 */
export function createJankDetector(
  onJank: (durationMs: number) => void,
): () => void {
  // Try Long Animation Frame API first
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            onJank(entry.duration);
          }
        }
      });
      observer.observe({ type: 'long-animation-frame', buffered: false });
      return () => observer.disconnect();
    } catch {
      // long-animation-frame not supported, fall through
    }
  }

  // Fallback: rAF-based detection
  let lastTime = 0;
  let rafId: number;
  let active = true;

  function check(timestamp: number) {
    if (!active) return;
    if (lastTime > 0) {
      const delta = timestamp - lastTime;
      if (delta > 50) onJank(delta);
    }
    lastTime = timestamp;
    rafId = requestAnimationFrame(check);
  }
  rafId = requestAnimationFrame(check);

  return () => {
    active = false;
    cancelAnimationFrame(rafId);
  };
}
