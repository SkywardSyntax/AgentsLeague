/**
 * Canvas performance monitor — tracks rendering metrics and web vitals.
 *
 * Integrates FrameTimeTracker for per-frame profiling and reports:
 *  - FPS (sustained 60fps target with 50+ elements)
 *  - Frame budget utilisation
 *  - TTFB, FCP, LCP, CLS (via PerformanceObserver)
 *  - Dirty-rect repaint stats
 *  - Element cache hit/miss rates
 */

import {
  FrameTimeTracker,
  RenderPercentileTracker,
  createPerformanceObserver,
  LATENCY_BUDGETS,
} from '@/utils/metrics';

export interface WebVitals {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
}

export interface RenderStats {
  elementsRendered: number;
  elementsCulled: number;
  dirtyRectsProcessed: number;
  fullRepaints: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface PerformanceReport {
  fps: number;
  avgFrameTime: number;
  p95FrameTime: number;
  droppedFrames: number;
  renderPercentiles: { p50: number; p95: number; p99: number; count: number };
  webVitals: WebVitals;
  renderStats: RenderStats;
  meetsTarget: boolean;
}

export class CanvasPerformanceMonitor {
  readonly frameTracker: FrameTimeTracker;
  readonly renderTracker: RenderPercentileTracker;

  private webVitals: WebVitals = { ttfb: null, fcp: null, lcp: null, cls: null };
  private clsValue = 0;
  private renderStats: RenderStats = {
    elementsRendered: 0,
    elementsCulled: 0,
    dirtyRectsProcessed: 0,
    fullRepaints: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  private disconnectors: (() => void)[] = [];

  constructor(maxSamples = 120) {
    this.frameTracker = new FrameTimeTracker(maxSamples);
    this.renderTracker = new RenderPercentileTracker(500);
    this.observeWebVitals();
  }

  private observeWebVitals(): void {
    // Navigation timing for TTFB
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        this.webVitals.ttfb = navEntries[0]!.responseStart - navEntries[0]!.requestStart;
      }
    }

    // FCP
    this.disconnectors.push(
      createPerformanceObserver({
        entryTypes: ['paint'],
        buffered: true,
        onEntries: (entries) => {
          for (const entry of entries) {
            if (entry.name === 'first-contentful-paint') {
              this.webVitals.fcp = entry.startTime;
            }
          }
        },
      }),
    );

    // LCP
    this.disconnectors.push(
      createPerformanceObserver({
        entryTypes: ['largest-contentful-paint'],
        buffered: true,
        onEntries: (entries) => {
          const last = entries[entries.length - 1];
          if (last) {
            this.webVitals.lcp = last.startTime;
          }
        },
      }),
    );

    // CLS
    this.disconnectors.push(
      createPerformanceObserver({
        entryTypes: ['layout-shift'],
        buffered: true,
        onEntries: (entries) => {
          for (const entry of entries) {
            if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
              this.clsValue += (entry as PerformanceEntry & { value: number }).value;
              this.webVitals.cls = this.clsValue;
            }
          }
        },
      }),
    );
  }

  /** Record a frame tick (call from rAF). */
  tick(timestamp: number): void {
    this.frameTracker.tick(timestamp);
  }

  /** Record a render duration. */
  recordRender(durationMs: number): void {
    this.renderTracker.record(durationMs);
  }

  /** Update render stats accumulators. */
  recordFrame(rendered: number, culled: number, dirtyRects: number, fullRepaint: boolean): void {
    this.renderStats.elementsRendered += rendered;
    this.renderStats.elementsCulled += culled;
    this.renderStats.dirtyRectsProcessed += dirtyRects;
    if (fullRepaint) this.renderStats.fullRepaints++;
  }

  recordCacheHit(): void { this.renderStats.cacheHits++; }
  recordCacheMiss(): void { this.renderStats.cacheMisses++; }

  /** Generate a full performance report. */
  getReport(): PerformanceReport {
    const frameMetrics = this.frameTracker.getMetrics();
    const renderPercentiles = this.renderTracker.snapshot();

    const report: PerformanceReport = {
      fps: frameMetrics.fps,
      avgFrameTime: frameMetrics.avgFrameTime,
      p95FrameTime: frameMetrics.p95FrameTime,
      droppedFrames: frameMetrics.droppedFrames,
      renderPercentiles,
      webVitals: { ...this.webVitals },
      renderStats: { ...this.renderStats },
      meetsTarget: frameMetrics.fps >= 58 && frameMetrics.p95FrameTime < (LATENCY_BUDGETS['frame-budget'] ?? 16),
    };

    return report;
  }

  /** Log performance report to console in a formatted table. */
  logReport(): void {
    const report = this.getReport();

    console.group('%c[Canvas Performance Report]', 'color: #3B82F6; font-weight: bold');

    console.log(`FPS: ${report.fps.toFixed(1)} ${report.meetsTarget ? '✅' : '❌'} (target: 60)`);
    console.log(`Avg frame time: ${report.avgFrameTime.toFixed(2)}ms`);
    console.log(`P95 frame time: ${report.p95FrameTime.toFixed(2)}ms`);
    console.log(`Dropped frames: ${report.droppedFrames}`);

    console.group('Render percentiles');
    console.log(`P50: ${report.renderPercentiles.p50.toFixed(2)}ms`);
    console.log(`P95: ${report.renderPercentiles.p95.toFixed(2)}ms`);
    console.log(`P99: ${report.renderPercentiles.p99.toFixed(2)}ms`);
    console.log(`Samples: ${report.renderPercentiles.count}`);
    console.groupEnd();

    console.group('Web Vitals');
    console.log(`TTFB: ${report.webVitals.ttfb?.toFixed(1) ?? 'N/A'}ms`);
    console.log(`FCP:  ${report.webVitals.fcp?.toFixed(1) ?? 'N/A'}ms`);
    console.log(`LCP:  ${report.webVitals.lcp?.toFixed(1) ?? 'N/A'}ms`);
    console.log(`CLS:  ${report.webVitals.cls?.toFixed(4) ?? 'N/A'}`);
    console.groupEnd();

    console.group('Render stats');
    console.log(`Elements rendered: ${report.renderStats.elementsRendered}`);
    console.log(`Elements culled: ${report.renderStats.elementsCulled}`);
    console.log(`Dirty rects: ${report.renderStats.dirtyRectsProcessed}`);
    console.log(`Full repaints: ${report.renderStats.fullRepaints}`);
    const totalCache = report.renderStats.cacheHits + report.renderStats.cacheMisses;
    const hitRate = totalCache > 0 ? ((report.renderStats.cacheHits / totalCache) * 100).toFixed(1) : 'N/A';
    console.log(`Cache hit rate: ${hitRate}%`);
    console.groupEnd();

    console.groupEnd();
  }

  /** Reset all metrics. */
  reset(): void {
    this.frameTracker.reset();
    this.renderTracker.reset();
    this.clsValue = 0;
    this.webVitals = { ttfb: null, fcp: null, lcp: null, cls: null };
    this.renderStats = {
      elementsRendered: 0,
      elementsCulled: 0,
      dirtyRectsProcessed: 0,
      fullRepaints: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  destroy(): void {
    for (const disconnect of this.disconnectors) {
      disconnect();
    }
    this.disconnectors.length = 0;
  }
}
