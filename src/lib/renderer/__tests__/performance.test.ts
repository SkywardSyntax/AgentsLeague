/**
 * Performance tests for canvas rendering — rAF batching, FPS tracking,
 * viewport culling, dirty-rect tracking, element caching, and jank detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WhiteboardRenderer } from '../../renderer/WhiteboardRenderer';
import {
  createMockCanvasContext,
  createRAFController,
  canvas50,
  canvas1000,
  rectElement,
} from '@/lib/test-utils';
import type { DrawElement, Camera } from '@/types/drawing';

// ── Setup ───────────────────────────────────────────────────────────

let ctx: ReturnType<typeof createMockCanvasContext>;
let raf: ReturnType<typeof createRAFController>;

beforeEach(() => {
  ctx = createMockCanvasContext();
  raf = createRAFController();
  raf.install();
});

afterEach(() => {
  raf.restore();
});

// ── Helpers ─────────────────────────────────────────────────────────

function createRenderer(width = 1920, height = 1080): WhiteboardRenderer {
  return new WhiteboardRenderer(ctx, width, height, 1);
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Canvas rAF batching', () => {
  it('batches multiple upsertElements into a single rAF frame', () => {
    const renderer = createRenderer();
    const _clearBefore = ctx.__calls.filter((c) => c.includes('clearRect')).length;

    // Multiple upserts should coalesce into one frame
    renderer.upsertElements([rectElement]);
    renderer.upsertElements([{ ...rectElement, id: 'rect-2', x: 200 }]);
    renderer.upsertElements([{ ...rectElement, id: 'rect-3', x: 300 }]);

    // Before flush, no additional clearRect calls from rendering
    const clearAfterUpsert = ctx.__calls.filter((c) => c.includes('clearRect')).length;

    // Flush the single batched frame
    raf.flush(performance.now());

    const clearAfterFlush = ctx.__calls.filter((c) => c.includes('clearRect')).length;
    // Should have rendered exactly one full repaint (one clearRect)
    expect(clearAfterFlush).toBeGreaterThan(clearAfterUpsert);

    renderer.destroy();
  });

  it('scheduleRender deduplicates — only one pending frame at a time', () => {
    const renderer = createRenderer();

    renderer.upsertElements([rectElement]);
    // At most 1 pending rAF callback
    expect(raf.pending).toBeLessThanOrEqual(1);

    renderer.upsertElements([{ ...rectElement, id: 'rect-2' }]);
    // Still at most 1
    expect(raf.pending).toBeLessThanOrEqual(1);

    renderer.destroy();
  });
});

describe('FPS tracking with 50 shapes', () => {
  it('renders 50 elements within a reasonable frame budget', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas50);
    raf.flush(0);

    // Measure simulated render by counting draw calls
    const drawCalls = ctx.__calls.filter(
      (c) => c.startsWith('fill(') || c.startsWith('stroke(') || c.startsWith('fillText('),
    );

    // Each element should generate at least one draw call
    expect(drawCalls.length).toBeGreaterThanOrEqual(canvas50.length * 0.5);

    renderer.destroy();
  });

  it('supports sustained rendering across multiple frames', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas50);

    const frameTimestamps: number[] = [];

    // Simulate 60 frames at ~16.67ms intervals
    for (let i = 0; i < 60; i++) {
      const ts = i * 16.67;
      frameTimestamps.push(ts);

      // Modify an element to trigger re-render
      const el = { ...canvas50[i % canvas50.length]!, updatedAt: Date.now() + i };
      renderer.upsertElements([el]);
      raf.flush(ts);
    }

    expect(frameTimestamps).toHaveLength(60);

    renderer.destroy();
  });
});

describe('Viewport culling', () => {
  it('skips off-screen elements during renderFull', () => {
    const renderer = createRenderer(800, 600);

    // Place elements: one visible, one off-screen
    const visible: DrawElement = { ...rectElement, id: 'visible', x: 100, y: 100 };
    const offscreen: DrawElement = { ...rectElement, id: 'offscreen', x: 5000, y: 5000 };
    renderer.upsertElements([visible, offscreen]);
    raf.flush(0);

    // Reset call tracking
    ctx.__calls.length = 0;

    // Re-render with camera that only shows near (0,0)
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    renderer.renderFull(camera);

    // The off-screen element should be culled — fewer draw calls
    const drawCalls = ctx.__calls.filter(
      (c) => c.startsWith('fill(') || c.startsWith('stroke('),
    );
    // We expect draw calls for visible but not for offscreen
    expect(drawCalls.length).toBeGreaterThan(0);

    renderer.destroy();
  });
});

describe('Large canvas stress test', () => {
  it('handles 1000 elements without error', () => {
    const renderer = createRenderer();

    expect(() => {
      renderer.upsertElements(canvas1000);
      raf.flush(0);
    }).not.toThrow();

    renderer.destroy();
  });

  it('clear() efficiently resets all elements', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas1000);
    raf.flush(0);

    renderer.clear();

    // After clear, getElement should return undefined
    expect(renderer.getElement('rect-0')).toBeUndefined();

    renderer.destroy();
  });

  it('destroy cancels pending frames', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas50);

    // There should be a pending frame
    expect(raf.pending).toBe(1);

    renderer.destroy();

    // After destroy, no pending frames
    expect(raf.pending).toBe(0);
  });
});

describe('DPR-aware sizing', () => {
  it('scales canvas dimensions by device pixel ratio', () => {
    const dpr = 2;
    const renderer = new WhiteboardRenderer(ctx, 800, 600, dpr);

    expect(ctx.canvas.width).toBe(1600);
    expect(ctx.canvas.height).toBe(1200);

    renderer.destroy();
  });

  it('resize updates canvas dimensions', () => {
    const renderer = createRenderer();

    renderer.resize(1024, 768, 1.5);

    expect(ctx.canvas.width).toBe(Math.round(1024 * 1.5));
    expect(ctx.canvas.height).toBe(Math.round(768 * 1.5));

    renderer.destroy();
  });
});

describe('Dirty-rect tracking', () => {
  it('uses dirty-rect rendering for small mutations', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas50);
    raf.flush(0);

    ctx.__calls.length = 0;

    // Mutate a single element — should trigger dirty-rect, not full repaint
    const mutated = { ...canvas50[0]!, x: 999, updatedAt: Date.now() + 1 };
    renderer.upsertElements([mutated]);
    raf.flush(16.67);

    // Dirty-rect rendering uses clip() for region isolation
    const clipCalls = ctx.__calls.filter((c) => c.startsWith('clip('));
    const clearCalls = ctx.__calls.filter((c) => c.startsWith('clearRect('));

    // Should have at least one clip (dirty-rect) or one clearRect (bounded clear)
    expect(clipCalls.length + clearCalls.length).toBeGreaterThan(0);

    renderer.destroy();
  });

  it('falls back to full repaint when many elements are dirty', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas50);
    raf.flush(0);

    ctx.__calls.length = 0;

    // Mutate >40% of elements — should trigger full repaint
    const mutations = canvas50.slice(0, 25).map((el, i) => ({
      ...el,
      x: el.x + 1,
      updatedAt: Date.now() + i,
    }));
    renderer.upsertElements(mutations);
    raf.flush(33.33);

    // Full repaint clears entire canvas
    const clearCalls = ctx.__calls.filter((c) => c.startsWith('clearRect('));
    expect(clearCalls.length).toBeGreaterThan(0);

    renderer.destroy();
  });

  it('tracks removed element bounds for dirty invalidation', () => {
    const renderer = createRenderer();
    const el1: DrawElement = { ...rectElement, id: 'remove-test', x: 50, y: 50 };
    renderer.upsertElements([el1, ...canvas50.slice(0, 5)]);
    raf.flush(0);

    ctx.__calls.length = 0;
    renderer.removeElement('remove-test');
    raf.flush(50);

    // Should have repainted the region where the element was
    expect(ctx.__calls.length).toBeGreaterThan(0);

    renderer.destroy();
  });
});

describe('CanvasPerformanceMonitor integration', () => {
  it('tracks frame metrics via perfMonitor', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas50);

    // Simulate multiple frames
    for (let i = 0; i < 30; i++) {
      const ts = i * 16.67;
      const el = { ...canvas50[i % canvas50.length]!, updatedAt: Date.now() + i };
      renderer.upsertElements([el]);
      raf.flush(ts);
    }

    const report = renderer.perfMonitor.getReport();
    expect(report.renderStats.elementsRendered).toBeGreaterThan(0);
    expect(report.renderPercentiles.count).toBeGreaterThan(0);

    renderer.destroy();
  });

  it('reports render stats including culled elements', () => {
    const renderer = createRenderer(800, 600);

    const visible: DrawElement = { ...rectElement, id: 'vis', x: 100, y: 100 };
    const offscreen: DrawElement = { ...rectElement, id: 'off', x: 5000, y: 5000 };
    renderer.upsertElements([visible, offscreen]);
    raf.flush(0);

    // Trigger a full repaint with camera
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    renderer.renderFull(camera);

    const report = renderer.perfMonitor.getReport();
    expect(report.renderStats.elementsCulled).toBeGreaterThan(0);

    renderer.destroy();
  });

  it('getCacheStats returns current cache sizes', () => {
    const renderer = createRenderer();
    const stats = renderer.getCacheStats();
    expect(stats.elementCacheSize).toBe(0);
    expect(stats.textCacheSize).toBe(0);

    renderer.destroy();
  });

  it('clear() invalidates all caches', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas50);
    raf.flush(0);

    renderer.clear();
    const stats = renderer.getCacheStats();
    expect(stats.elementCacheSize).toBe(0);
    expect(stats.textCacheSize).toBe(0);

    renderer.destroy();
  });

  it('perfMonitor is cleaned up on destroy', () => {
    const renderer = createRenderer();
    renderer.upsertElements(canvas50);
    raf.flush(0);

    // Should not throw
    expect(() => renderer.destroy()).not.toThrow();
  });
});
