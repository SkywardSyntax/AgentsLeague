import type { BoundingBox, Camera, DrawElement } from '@/types/drawing';
import {
  renderRect,
  renderEllipse,
  renderLine,
  renderArrow,
  renderFreehand,
  renderText,
  renderImage,
} from './shape-renderers';
import { applyBaseStyle, resetStyle } from './StyleManager';
import { CanvasPerformanceMonitor } from './CanvasPerformanceMonitor';

// Stroke padding for dirty-rect expansion
const DIRTY_RECT_PADDING = 4;

/**
 * Core whiteboard rendering engine.
 *
 * Manages a Map of elements, z-index sorting, viewport culling,
 * dirty-rect tracking, and DPR-aware canvas sizing.
 *
 * Performance optimizations:
 *  - OffscreenCanvas element caching (bitmap cache per element)
 *  - ImageBitmap text caching (avoids expensive text re-measurement)
 *  - Dirty-rect rendering (only repaint changed regions)
 *  - Batched rAF scheduling (coalesces mutations per frame)
 *  - Minimized context state changes (save/restore only for dirty elements)
 *  - Integrated FrameTimeTracker profiling via CanvasPerformanceMonitor
 */
export class WhiteboardRenderer {
  private ctx: CanvasRenderingContext2D;
  private logicalWidth: number;
  private logicalHeight: number;
  private dpr: number;

  private elements = new Map<string, DrawElement>();
  private sortedIds: string[] = [];
  private dirtyIds = new Set<string>();
  private removedBounds: BoundingBox[] = [];
  private pendingFrame: number | null = null;

  // OffscreenCanvas element cache: id → { bitmap, version }
  private elementCache = new Map<string, { bitmap: ImageBitmap | OffscreenCanvas; version: number }>();
  // Text-specific ImageBitmap cache: content+style hash → ImageBitmap
  private textCache = new Map<string, ImageBitmap | OffscreenCanvas>();
  // Previous bounds for dirty-rect invalidation
  private prevBounds = new Map<string, BoundingBox>();

  /** Performance monitor — exposes FrameTimeTracker + web vitals. */
  readonly perfMonitor: CanvasPerformanceMonitor;

  constructor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
  ) {
    this.ctx = ctx;
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.dpr = dpr;
    this.perfMonitor = new CanvasPerformanceMonitor();
    this.applyDPR();
  }

  // ── DPR-aware sizing ──────────────────────────────────────

  private applyDPR(): void {
    const canvas = this.ctx.canvas;
    canvas.width = this.logicalWidth * this.dpr;
    canvas.height = this.logicalHeight * this.dpr;
    canvas.style.width = `${this.logicalWidth}px`;
    canvas.style.height = `${this.logicalHeight}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  resize(width: number, height: number, dpr: number): void {
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.dpr = dpr;
    this.applyDPR();
    this.invalidateAllCaches();
    this.renderFull();
  }

  // ── Element management ────────────────────────────────────

  upsertElements(incoming: DrawElement[]): void {
    for (const el of incoming) {
      // Track previous bounds for dirty-rect invalidation
      const prev = this.elements.get(el.id);
      if (prev) {
        this.prevBounds.set(el.id, this.getElementBounds(prev));
      }
      this.elements.set(el.id, el);
      this.dirtyIds.add(el.id);
      // Invalidate element cache on mutation
      this.elementCache.delete(el.id);
    }
    this.rebuildSortOrder();
    this.scheduleRender();
  }

  removeElement(id: string): void {
    const el = this.elements.get(id);
    if (el) {
      this.removedBounds.push(this.getElementBounds(el));
    }
    this.elements.delete(id);
    this.dirtyIds.delete(id);
    this.elementCache.delete(id);
    this.prevBounds.delete(id);
    this.rebuildSortOrder();
    this.scheduleRender();
  }

  clear(): void {
    this.elements.clear();
    this.sortedIds = [];
    this.dirtyIds.clear();
    this.removedBounds.length = 0;
    this.invalidateAllCaches();
    this.clearCanvas();
  }

  getElement(id: string): DrawElement | undefined {
    return this.elements.get(id);
  }

  // ── Sort order ────────────────────────────────────────────

  private rebuildSortOrder(): void {
    this.sortedIds = [...this.elements.keys()].sort((a, b) => {
      const ea = this.elements.get(a)!;
      const eb = this.elements.get(b)!;
      return (ea.createdAt ?? 0) - (eb.createdAt ?? 0);
    });
  }

  // ── Render scheduling (batched rAF) ───────────────────────

  private scheduleRender(): void {
    if (this.pendingFrame !== null) return;
    this.pendingFrame = requestAnimationFrame((timestamp) => {
      this.pendingFrame = null;
      this.perfMonitor.tick(timestamp);
      const start = performance.now();
      this.renderDirty();
      this.perfMonitor.recordRender(performance.now() - start);
    });
  }

  // ── Dirty-rect rendering ──────────────────────────────────

  /**
   * Only repaint regions that changed. Falls back to full repaint
   * when the dirty set is large relative to total elements.
   */
  private renderDirty(camera?: Camera): void {
    // If >40% elements dirty or first paint, do full repaint
    if (this.dirtyIds.size === 0 && this.removedBounds.length === 0) return;

    const dirtyRatio = this.dirtyIds.size / Math.max(this.elements.size, 1);
    if (dirtyRatio > 0.4 || this.elements.size < 10) {
      this.renderFull(camera);
      return;
    }

    // Collect dirty regions: union of old bounds + new bounds
    const dirtyRects: BoundingBox[] = [...this.removedBounds];

    for (const id of this.dirtyIds) {
      const prev = this.prevBounds.get(id);
      if (prev) dirtyRects.push(this.expandRect(prev));

      const el = this.elements.get(id);
      if (el) dirtyRects.push(this.expandRect(this.getElementBounds(el)));
    }

    if (dirtyRects.length === 0) {
      this.dirtyIds.clear();
      this.removedBounds.length = 0;
      this.prevBounds.clear();
      return;
    }

    const merged = this.mergeDirtyRects(dirtyRects);

    // Clear and repaint only dirty regions
    const { ctx } = this;
    let rendered = 0;
    let culled = 0;

    for (const rect of merged) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);

      // Re-render all elements that overlap this dirty region
      for (const id of this.sortedIds) {
        const el = this.elements.get(id);
        if (!el) continue;
        if (camera && !this.isInViewport(el, camera)) { culled++; continue; }

        const bounds = this.getElementBounds(el);
        if (this.rectsOverlap(bounds, rect)) {
          this.renderElementCached(el, camera);
          rendered++;
        } else {
          culled++;
        }
      }

      ctx.restore();
    }

    this.perfMonitor.recordFrame(rendered, culled, merged.length, false);
    this.dirtyIds.clear();
    this.removedBounds.length = 0;
    this.prevBounds.clear();
  }

  /** Expand a bounding box by stroke padding. */
  private expandRect(r: BoundingBox): BoundingBox {
    return {
      x: r.x - DIRTY_RECT_PADDING,
      y: r.y - DIRTY_RECT_PADDING,
      w: r.w + DIRTY_RECT_PADDING * 2,
      h: r.h + DIRTY_RECT_PADDING * 2,
    };
  }

  /** AABB overlap test. */
  private rectsOverlap(a: BoundingBox, b: BoundingBox): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /** Merge overlapping dirty rects into larger regions to reduce clip calls. */
  private mergeDirtyRects(rects: BoundingBox[]): BoundingBox[] {
    if (rects.length <= 1) return rects;

    // Simple greedy merge: combine overlapping rects
    const merged: BoundingBox[] = [...rects];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < merged.length; i++) {
        for (let j = i + 1; j < merged.length; j++) {
          if (this.rectsOverlap(merged[i]!, merged[j]!)) {
            const a = merged[i]!;
            const b = merged[j]!;
            const minX = Math.min(a.x, b.x);
            const minY = Math.min(a.y, b.y);
            merged[i] = {
              x: minX,
              y: minY,
              w: Math.max(a.x + a.w, b.x + b.w) - minX,
              h: Math.max(a.y + a.h, b.y + b.h) - minY,
            };
            merged.splice(j, 1);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    return merged;
  }

  // ── Full repaint ──────────────────────────────────────────

  renderFull(camera?: Camera): void {
    this.clearCanvas();

    let rendered = 0;
    let culled = 0;

    for (const id of this.sortedIds) {
      const el = this.elements.get(id);
      if (!el) continue;

      // Viewport culling: skip elements entirely outside the visible area
      if (camera && !this.isInViewport(el, camera)) { culled++; continue; }

      this.renderElementCached(el, camera);
      rendered++;
    }

    this.perfMonitor.recordFrame(rendered, culled, 0, true);
    this.dirtyIds.clear();
    this.removedBounds.length = 0;
    this.prevBounds.clear();
  }

  // ── OffscreenCanvas element caching ───────────────────────

  /**
   * Render an element using its cached bitmap when available.
   * Cache miss → render to OffscreenCanvas → store bitmap → blit to main canvas.
   */
  private renderElementCached(el: DrawElement, camera?: Camera): void {
    const bounds = this.getElementBounds(el);
    const cacheKey = el.id;
    const version = el.updatedAt;
    const cached = this.elementCache.get(cacheKey);

    // Text elements use dedicated ImageBitmap cache
    if (el.type === 'text') {
      this.renderTextCached(el, camera);
      return;
    }

    // Try cache hit
    if (cached && cached.version === version && !el.rotation) {
      this.blitCached(cached.bitmap, bounds, camera);
      this.perfMonitor.recordCacheHit();
      return;
    }

    // Cache miss — render to OffscreenCanvas if available
    if (typeof OffscreenCanvas !== 'undefined' && !el.rotation && bounds.w > 0 && bounds.h > 0) {
      try {
        const oc = new OffscreenCanvas(
          Math.ceil(bounds.w * this.dpr) + DIRTY_RECT_PADDING * 2,
          Math.ceil(bounds.h * this.dpr) + DIRTY_RECT_PADDING * 2,
        );
        const octx = oc.getContext('2d');
        if (octx) {
          octx.scale(this.dpr, this.dpr);
          octx.translate(-bounds.x + DIRTY_RECT_PADDING, -bounds.y + DIRTY_RECT_PADDING);

          applyBaseStyle(octx as unknown as CanvasRenderingContext2D, el);
          this.dispatchRender(octx as unknown as CanvasRenderingContext2D, el);
          resetStyle(octx as unknown as CanvasRenderingContext2D);

          this.elementCache.set(cacheKey, { bitmap: oc, version });
          this.blitCached(oc, bounds, camera);
          this.perfMonitor.recordCacheMiss();
          return;
        }
      } catch {
        // OffscreenCanvas not supported or error, fall through
      }
    }

    // Fallback: direct render
    this.perfMonitor.recordCacheMiss();
    this.renderElement(el, camera);
  }

  /** Render text using ImageBitmap cache for expensive text measurement. */
  private renderTextCached(el: DrawElement & { type: 'text' }, camera?: Camera): void {
    if (el.type !== 'text') return;
    const textKey = `${el.id}:${el.updatedAt}`;
    const cached = this.textCache.get(textKey);
    const bounds = this.getElementBounds(el);

    if (cached) {
      this.blitCached(cached, bounds, camera);
      this.perfMonitor.recordCacheHit();
      return;
    }

    // Render text to OffscreenCanvas and cache
    if (typeof OffscreenCanvas !== 'undefined' && bounds.w > 0 && bounds.h > 0) {
      try {
        const oc = new OffscreenCanvas(
          Math.ceil(bounds.w * this.dpr) + DIRTY_RECT_PADDING * 2,
          Math.ceil(bounds.h * this.dpr) + DIRTY_RECT_PADDING * 2,
        );
        const octx = oc.getContext('2d');
        if (octx) {
          octx.scale(this.dpr, this.dpr);
          octx.translate(-bounds.x + DIRTY_RECT_PADDING, -bounds.y + DIRTY_RECT_PADDING);

          applyBaseStyle(octx as unknown as CanvasRenderingContext2D, el);
          this.dispatchRender(octx as unknown as CanvasRenderingContext2D, el);
          resetStyle(octx as unknown as CanvasRenderingContext2D);

          // Evict old entries for this element
          for (const key of this.textCache.keys()) {
            if (key.startsWith(`${el.id}:`)) {
              this.textCache.delete(key);
              break;
            }
          }

          this.textCache.set(textKey, oc);
          this.blitCached(oc, bounds, camera);
          this.perfMonitor.recordCacheMiss();
          return;
        }
      } catch {
        // Fall through to direct render
      }
    }

    this.perfMonitor.recordCacheMiss();
    this.renderElement(el, camera);
  }

  /** Blit a cached bitmap/OffscreenCanvas to the main canvas. */
  private blitCached(
    bitmap: ImageBitmap | OffscreenCanvas,
    bounds: BoundingBox,
    camera?: Camera,
  ): void {
    const { ctx } = this;
    ctx.save();

    if (camera) {
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);
    }

    ctx.drawImage(
      bitmap as CanvasImageSource,
      bounds.x - DIRTY_RECT_PADDING,
      bounds.y - DIRTY_RECT_PADDING,
      bounds.w + DIRTY_RECT_PADDING * 2,
      bounds.h + DIRTY_RECT_PADDING * 2,
    );

    ctx.restore();
  }

  // ── Shape dispatcher ──────────────────────────────────────

  /** Dispatch to shape renderer without save/restore (caller manages). */
  private dispatchRender(ctx: CanvasRenderingContext2D, el: DrawElement): void {
    switch (el.type) {
      case 'rect': renderRect(ctx, el); break;
      case 'ellipse': renderEllipse(ctx, el); break;
      case 'line': renderLine(ctx, el); break;
      case 'arrow': renderArrow(ctx, el); break;
      case 'freehand': renderFreehand(ctx, el); break;
      case 'text': renderText(ctx, el); break;
      case 'image': renderImage(ctx, el); break;
    }
  }

  renderElement(el: DrawElement, camera?: Camera): void {
    const { ctx } = this;
    ctx.save();

    // Camera transform
    if (camera) {
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);
    }

    // Element-level transform
    ctx.globalAlpha = el.opacity;
    if (el.rotation) {
      const cx = el.x + (('w' in el ? (el as { w: number }).w : 0) / 2);
      const cy = el.y + (('h' in el ? (el as { h: number }).h : 0) / 2);
      ctx.translate(cx, cy);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    applyBaseStyle(ctx, el);
    this.dispatchRender(ctx, el);
    resetStyle(ctx);
    ctx.restore();
  }

  // ── Viewport culling ──────────────────────────────────────

  private isInViewport(el: DrawElement, camera: Camera): boolean {
    const bounds = this.getElementBounds(el);
    const vx = -camera.x / camera.zoom;
    const vy = -camera.y / camera.zoom;
    const vw = this.logicalWidth / camera.zoom;
    const vh = this.logicalHeight / camera.zoom;

    return (
      bounds.x + bounds.w >= vx &&
      bounds.x <= vx + vw &&
      bounds.y + bounds.h >= vy &&
      bounds.y <= vy + vh
    );
  }

  getElementBounds(el: DrawElement): BoundingBox {
    switch (el.type) {
      case 'rect':
      case 'text':
      case 'image':
        return { x: el.x, y: el.y, w: el.w, h: el.h };
      case 'ellipse':
        return { x: el.x, y: el.y, w: el.rx * 2, h: el.ry * 2 };
      case 'line':
      case 'arrow':
      case 'freehand': {
        if (el.points.length === 0) return { x: el.x, y: el.y, w: 0, h: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of el.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        return {
          x: el.x + minX,
          y: el.y + minY,
          w: maxX - minX,
          h: maxY - minY,
        };
      }
    }
  }

  // ── Cache management ──────────────────────────────────────

  private invalidateAllCaches(): void {
    this.elementCache.clear();
    this.textCache.clear();
    this.prevBounds.clear();
  }

  /** Get current cache sizes for diagnostics. */
  getCacheStats(): { elementCacheSize: number; textCacheSize: number } {
    return {
      elementCacheSize: this.elementCache.size,
      textCacheSize: this.textCache.size,
    };
  }

  // ── Canvas helpers ────────────────────────────────────────

  private clearCanvas(): void {
    this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
  }

  destroy(): void {
    if (this.pendingFrame !== null) {
      cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }
    this.elements.clear();
    this.sortedIds = [];
    this.dirtyIds.clear();
    this.removedBounds.length = 0;
    this.invalidateAllCaches();
    this.perfMonitor.destroy();
  }
}
