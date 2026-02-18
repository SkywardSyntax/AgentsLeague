/**
 * SkeletonRenderer — generates placeholder visuals while AI content
 * streams in, masking latency per PERFORMANCE_STRATEGY.md §2.1.
 *
 * Targets:
 *  - Skeleton visible within 50 ms of user action
 *  - Crossfade to real content within 150 ms
 */

import type { BoundingBox } from '@/types';

// ── Configuration ───────────────────────────────────────────────────

export interface SkeletonConfig {
  /** Estimated layout region for placeholders. */
  estimatedBounds: BoundingBox;
  /** Number of placeholder shapes to render. */
  estimatedShapeCount: number;
  /** Visual animation style. */
  animation: 'pulse' | 'shimmer';
  /** Auto-dismiss timeout (ms). */
  timeoutMs: number;
}

export interface SkeletonHandle {
  /** Replace skeletons with real content (crossfade). */
  replace: () => void;
  /** Dismiss without replacement. */
  dismiss: () => void;
  /** Whether the skeleton is currently active. */
  isActive: () => boolean;
}

// ── Placeholder generation ──────────────────────────────────────────

interface PlaceholderRect extends BoundingBox {
  cornerRadius: number;
}

/**
 * Distribute placeholder rectangles within a bounding region.
 * Uses a simple grid layout based on estimated count.
 */
export function generatePlaceholders(
  bounds: BoundingBox,
  count: number,
): PlaceholderRect[] {
  const clamped = Math.max(1, Math.min(count, 20));
  const cols = Math.ceil(Math.sqrt(clamped));
  const rows = Math.ceil(clamped / cols);

  const gapX = 16;
  const gapY = 16;
  const cellW = (bounds.w - gapX * (cols + 1)) / cols;
  const cellH = (bounds.h - gapY * (rows + 1)) / rows;

  const rects: PlaceholderRect[] = [];
  for (let i = 0; i < clamped; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    rects.push({
      x: bounds.x + gapX + col * (cellW + gapX),
      y: bounds.y + gapY + row * (cellH + gapY),
      w: Math.max(cellW, 24),
      h: Math.max(cellH, 16),
      cornerRadius: 8,
    });
  }
  return rects;
}

// ── Ghost bounding boxes ────────────────────────────────────────────

/**
 * Draw a dashed-outline ghost rectangle (placeholder indicator).
 * From TECHNICAL_SPEC.md §3.2.
 */
export function drawGhostBox(
  ctx: CanvasRenderingContext2D,
  rect: BoundingBox,
  opts: { color?: string; lineWidth?: number; dash?: number[] } = {},
): void {
  const {
    color = 'rgba(0, 122, 255, 0.25)',
    lineWidth = 1.5,
    dash = [6, 4],
  } = opts;

  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Skeleton rendering ──────────────────────────────────────────────

const SKELETON_FILL = 'rgba(0, 0, 0, 0.04)';
const SKELETON_STROKE = 'rgba(0, 0, 0, 0.06)';

/**
 * Render all skeleton placeholder rectangles with rounded corners.
 */
export function drawSkeletonPlaceholders(
  ctx: CanvasRenderingContext2D,
  placeholders: readonly PlaceholderRect[],
  opacity = 1,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;

  for (const p of placeholders) {
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, p.cornerRadius);
    ctx.fillStyle = SKELETON_FILL;
    ctx.fill();
    ctx.strokeStyle = SKELETON_STROKE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

// ── Shimmer overlay ─────────────────────────────────────────────────

/**
 * Draw a shimmer gradient sweep across the given bounds.
 * @param phase 0→1 normalised sweep position (animate externally).
 */
export function drawShimmerOverlay(
  ctx: CanvasRenderingContext2D,
  bounds: BoundingBox,
  phase: number,
): void {
  ctx.save();

  // Shimmer band is 30% of width, sweeping left→right
  const bandWidth = bounds.w * 0.3;
  const x0 = bounds.x + bounds.w * phase - bandWidth;
  const x1 = x0 + bandWidth;

  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

  ctx.restore();
}

// ── Pulse opacity calculator ────────────────────────────────────────

/**
 * Returns an opacity value oscillating between 0.3 and 1.0.
 * @param timestamp current rAF timestamp
 * @param periodMs full pulse cycle duration (default 1200 ms)
 */
export function pulseOpacity(timestamp: number, periodMs = 1200): number {
  const t = (timestamp % periodMs) / periodMs;
  // Smooth sine wave: 0.3→1.0→0.3
  return 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 - Math.PI / 2));
}

// ── SkeletonRenderer class ──────────────────────────────────────────

export class SkeletonRenderer {
  private config: SkeletonConfig | null = null;
  private placeholders: PlaceholderRect[] = [];
  private active = false;
  private rafId: number | null = null;
  private startTime = 0;
  private shimmerPhase = 0;
  private fadeOutProgress = 0;
  private fadingOut = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  private ctx: CanvasRenderingContext2D | null = null;
  private onDismiss?: () => void;

  /**
   * Show skeleton placeholders on the given canvas context.
   */
  show(
    ctx: CanvasRenderingContext2D,
    config: SkeletonConfig,
    onDismiss?: () => void,
  ): SkeletonHandle {
    this.ctx = ctx;
    this.config = config;
    if (onDismiss !== undefined) {
      this.onDismiss = onDismiss;
    }
    this.placeholders = generatePlaceholders(
      config.estimatedBounds,
      config.estimatedShapeCount,
    );
    this.active = true;
    this.fadingOut = false;
    this.fadeOutProgress = 0;
    this.startTime = performance.now();

    // Start render loop
    this.scheduleFrame();

    // Auto-dismiss timeout
    this.timeoutId = setTimeout(() => {
      this.dismiss();
    }, config.timeoutMs);

    return {
      replace: () => this.beginFadeOut(),
      dismiss: () => this.dismiss(),
      isActive: () => this.active,
    };
  }

  private scheduleFrame(): void {
    if (!this.active) return;
    this.rafId = requestAnimationFrame((ts) => this.render(ts));
  }

  private render(timestamp: number): void {
    if (!this.active || !this.ctx || !this.config) return;

    const ctx = this.ctx;
    const bounds = this.config.estimatedBounds;

    // Clear skeleton region
    ctx.clearRect(bounds.x, bounds.y, bounds.w, bounds.h);

    // Compute opacity
    let opacity = 1;
    if (this.fadingOut) {
      this.fadeOutProgress = Math.min(
        1,
        this.fadeOutProgress + 16 / 150, // ~150ms fade
      );
      opacity = 1 - this.fadeOutProgress;
      if (this.fadeOutProgress >= 1) {
        this.dismiss();
        return;
      }
    }

    // Render placeholders
    const animOpacity =
      this.config.animation === 'pulse'
        ? pulseOpacity(timestamp) * opacity
        : opacity;

    drawSkeletonPlaceholders(ctx, this.placeholders, animOpacity);

    // Shimmer overlay
    if (this.config.animation === 'shimmer') {
      const elapsed = timestamp - this.startTime;
      this.shimmerPhase = (elapsed % 1500) / 1500; // 1.5s sweep
      drawShimmerOverlay(ctx, bounds, this.shimmerPhase);
    }

    // Ghost outlines
    for (const p of this.placeholders) {
      drawGhostBox(ctx, p);
    }

    this.scheduleFrame();
  }

  private beginFadeOut(): void {
    this.fadingOut = true;
    this.fadeOutProgress = 0;
  }

  private dismiss(): void {
    this.active = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    // Final clear
    if (this.ctx && this.config) {
      const b = this.config.estimatedBounds;
      this.ctx.clearRect(b.x, b.y, b.w, b.h);
    }
    this.onDismiss?.();
  }

  /** Whether the skeleton is currently rendering. */
  isActive(): boolean {
    return this.active;
  }

  /** Tear down everything. */
  destroy(): void {
    this.dismiss();
    this.ctx = null;
    this.config = null;
    this.placeholders = [];
  }
}
