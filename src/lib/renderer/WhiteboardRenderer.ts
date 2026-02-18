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

/**
 * Core whiteboard rendering engine.
 *
 * Manages a Map of elements, z-index sorting, viewport culling,
 * dirty-rect tracking, and DPR-aware canvas sizing.
 */
export class WhiteboardRenderer {
  private ctx: CanvasRenderingContext2D;
  private logicalWidth: number;
  private logicalHeight: number;
  private dpr: number;

  private elements = new Map<string, DrawElement>();
  private sortedIds: string[] = [];
  private dirtyIds = new Set<string>();
  private pendingFrame: number | null = null;

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
    this.renderFull();
  }

  // ── Element management ────────────────────────────────────

  upsertElements(incoming: DrawElement[]): void {
    for (const el of incoming) {
      this.elements.set(el.id, el);
      this.dirtyIds.add(el.id);
    }
    this.rebuildSortOrder();
    this.scheduleRender();
  }

  removeElement(id: string): void {
    this.elements.delete(id);
    this.dirtyIds.delete(id);
    this.rebuildSortOrder();
    this.scheduleRender();
  }

  clear(): void {
    this.elements.clear();
    this.sortedIds = [];
    this.dirtyIds.clear();
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
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.renderFull();
    });
  }

  // ── Full repaint ──────────────────────────────────────────

  renderFull(camera?: Camera): void {
    this.clearCanvas();

    for (const id of this.sortedIds) {
      const el = this.elements.get(id);
      if (!el) continue;

      // Viewport culling: skip elements entirely outside the visible area
      if (camera && !this.isInViewport(el, camera)) continue;

      this.renderElement(el, camera);
    }
    this.dirtyIds.clear();
  }

  // ── Shape dispatcher ──────────────────────────────────────

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

    switch (el.type) {
      case 'rect':
        renderRect(ctx, el);
        break;
      case 'ellipse':
        renderEllipse(ctx, el);
        break;
      case 'line':
        renderLine(ctx, el);
        break;
      case 'arrow':
        renderArrow(ctx, el);
        break;
      case 'freehand':
        renderFreehand(ctx, el);
        break;
      case 'text':
        renderText(ctx, el);
        break;
      case 'image':
        renderImage(ctx, el);
        break;
    }

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

  private getElementBounds(el: DrawElement): BoundingBox {
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
  }
}
