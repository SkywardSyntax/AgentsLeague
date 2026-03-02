import { describe, it, expect } from 'vitest';
import { createRenderMetricsCollector } from '@/lib/whiteboard/render-metrics-collector';

describe('RenderMetricsCollector', () => {
  it('should start with empty state', () => {
    const collector = createRenderMetricsCollector();
    expect(collector.getFrames()).toHaveLength(0);
    expect(collector.snapshot().totalFrames).toBe(0);
  });

  it('should record a frame', () => {
    const collector = createRenderMetricsCollector();
    collector.recordFrame(16.5, 10, 50);
    expect(collector.getFrames()).toHaveLength(1);
    expect(collector.getFrames()[0].frameTime).toBe(16.5);
    expect(collector.getFrames()[0].drawCount).toBe(10);
    expect(collector.getFrames()[0].elementCount).toBe(50);
  });

  it('should compute FPS from multiple frames', () => {
    const collector = createRenderMetricsCollector();
    collector.recordFrame(16, 5, 20);
    collector.recordFrame(16, 5, 20);
    collector.recordFrame(16, 5, 20);
    const fps = collector.getFps();
    expect(fps).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 FPS with no frames', () => {
    const collector = createRenderMetricsCollector();
    expect(collector.getFps()).toBe(0);
  });

  it('should calculate rolling average for frameTime', () => {
    const collector = createRenderMetricsCollector();
    collector.recordFrame(10, 5, 20);
    collector.recordFrame(20, 10, 40);
    collector.recordFrame(30, 15, 60);
    const avg = collector.getRollingAverage('frameTime', 3);
    expect(avg).toBe(20);
  });

  it('should calculate rolling average for drawCount', () => {
    const collector = createRenderMetricsCollector();
    collector.recordFrame(10, 4, 20);
    collector.recordFrame(20, 8, 40);
    const avg = collector.getRollingAverage('drawCount', 2);
    expect(avg).toBe(6);
  });

  it('should detect slow frames above threshold', () => {
    const collector = createRenderMetricsCollector();
    collector.recordFrame(10, 5, 20);
    collector.recordFrame(20, 5, 20);
    collector.recordFrame(5, 5, 20);
    expect(collector.getSlowFrameCount(16.67)).toBe(1);
    expect(collector.getSlowFrameCount(8)).toBe(2);
  });

  it('should produce a valid snapshot', () => {
    const collector = createRenderMetricsCollector();
    collector.recordFrame(10, 4, 100);
    collector.recordFrame(20, 8, 200);
    const snap = collector.snapshot();
    expect(snap.totalFrames).toBe(2);
    expect(snap.avgFrameTime).toBe(15);
    expect(snap.avgDrawCount).toBe(6);
    expect(snap.avgElementCount).toBe(150);
    expect(snap.maxFrameTime).toBe(20);
  });

  it('should reset all metrics', () => {
    const collector = createRenderMetricsCollector();
    collector.recordFrame(16, 5, 20);
    collector.recordFrame(32, 10, 40);
    collector.reset();
    expect(collector.getFrames()).toHaveLength(0);
    expect(collector.snapshot().totalFrames).toBe(0);
  });

  it('should aggregate multiple frames correctly', () => {
    const collector = createRenderMetricsCollector();
    for (let i = 1; i <= 10; i++) {
      collector.recordFrame(i * 2, i, i * 10);
    }
    expect(collector.getFrames()).toHaveLength(10);
    expect(collector.getRollingAverage('elementCount', 5)).toBe(80);
    expect(collector.snapshot().maxFrameTime).toBe(20);
  });
});
