/**
 * StreamingDrawController — ingests SSE draw operations, batches them
 * per requestAnimationFrame, and drives element-level animations.
 *
 * Design goals (from PERFORMANCE_STRATEGY.md):
 *  - Skeleton appearance: <100 ms
 *  - First shape render: <600 ms
 *  - Full drawing: <3 s
 *  - Sustained: ≥60 fps (8 ms frame budget at 120 fps)
 */

import type { DrawElement, DrawOp } from '@/types';

// ── Easing functions ────────────────────────────────────────────────

export type EasingFn = (t: number) => number;

export const easing = {
  /** Apple-style ease-out: fast start, gentle settle. */
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),

  /** Expo ease-out: aggressive deceleration curve. */
  easeOutExpo: (t: number): number =>
    t === 1 ? 1 : 1 - Math.pow(2, -10 * t),

  /** Slight overshoot then settle — good for popIn. */
  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  /** Quad ease-out — lightweight. */
  easeOutQuad: (t: number): number => 1 - (1 - t) * (1 - t),

  /** Linear — no easing. */
  linear: (t: number): number => t,

  /** Custom cubic-bezier(0.16, 1, 0.3, 1) approximation (Apple ease-out). */
  appleEaseOut: (t: number): number => {
    // Attempt to approximate the Apple ease-out cubic-bezier(0.16, 1, 0.3, 1).
    // A fast rise with very gentle tail:
    return 1 - Math.pow(1 - t, 4);
  },
} as const;

// ── Animation types ─────────────────────────────────────────────────

export type AnimationEffect = 'fadeIn' | 'drawIn' | 'popIn' | 'none';

export interface AnimationConfig {
  readonly effect: AnimationEffect;
  readonly durationMs: number;
  readonly easingFn: EasingFn;
  readonly delayMs: number;
}

const DEFAULT_ANIMATION: AnimationConfig = {
  effect: 'fadeIn',
  durationMs: 200,
  easingFn: easing.appleEaseOut,
  delayMs: 0,
};

/** Per-element animation state tracked across frames. */
interface AnimationState {
  startTime: number;
  config: AnimationConfig;
  /** 0→1 normalised progress */
  progress: number;
  done: boolean;
}

// ── Rendered element wrapper ────────────────────────────────────────

export interface VisibleElement {
  readonly element: DrawElement;
  /** Current animation progress 0→1 (1 = fully visible). */
  readonly animProgress: number;
  /** Computed opacity accounting for animation. */
  readonly computedOpacity: number;
  /** Computed scale factor (for popIn). */
  readonly computedScale: number;
  /** Stroke-dashoffset ratio 0→1 for drawIn (1 = fully drawn). */
  readonly strokeProgress: number;
}

// ── Event callbacks ─────────────────────────────────────────────────

export interface StreamingDrawCallbacks {
  /** Called every rAF with the current set of visible elements. */
  onFrame?: (elements: readonly VisibleElement[], progress: number) => void;
  /** First real element rendered. */
  onFirstElement?: (element: DrawElement) => void;
  /** All queued operations have been rendered & animations complete. */
  onComplete?: () => void;
  /** An error occurred processing an op. */
  onError?: (error: Error) => void;
}

// ── Controller ──────────────────────────────────────────────────────

export class StreamingDrawController {
  // ── Scene state ───────────────────────────────────────────────────
  private elements = new Map<string, DrawElement>();
  private animations = new Map<string, AnimationState>();
  private pendingOps: DrawOp[] = [];

  // ── Scheduling ────────────────────────────────────────────────────
  private rafId: number | null = null;
  private dirty = false;
  private paused = false;
  private completed = false;
  private firstElementEmitted = false;

  // ── Stagger ───────────────────────────────────────────────────────
  private addIndex = 0;
  private readonly staggerMs: number;

  // ── Metrics ───────────────────────────────────────────────────────
  private totalExpected = 0;

  private readonly callbacks: StreamingDrawCallbacks;

  constructor(
    callbacks: StreamingDrawCallbacks = {},
    options: { staggerMs?: number } = {},
  ) {
    this.callbacks = callbacks;
    this.staggerMs = options.staggerMs ?? 40;
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Set expected total element count (for progress calculation). */
  setExpectedCount(count: number): void {
    this.totalExpected = count;
  }

  /** Ingest a single SSE DrawOp. Batched until next rAF. */
  push(op: DrawOp): void {
    this.pendingOps.push(op);
    this.scheduleTick();
  }

  /** Ingest multiple SSE DrawOps in one call. */
  pushBatch(ops: readonly DrawOp[]): void {
    for (const op of ops) {
      this.pendingOps.push(op);
    }
    this.scheduleTick();
  }

  /** Signal that the SSE stream is complete (no more ops expected). */
  finish(): void {
    this.completed = true;
    this.scheduleTick();
  }

  /** Pause animation loop (elements freeze in place). */
  pause(): void {
    this.paused = true;
  }

  /** Resume animation loop. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleTick();
  }

  /** Clear all state, cancel pending frame. */
  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.elements.clear();
    this.animations.clear();
    this.pendingOps.length = 0;
    this.dirty = false;
    this.paused = false;
    this.completed = false;
    this.firstElementEmitted = false;
    this.addIndex = 0;
    this.totalExpected = 0;
  }

  /** Reset scene but keep callbacks. */
  reset(): void {
    this.destroy();
  }

  /** Returns current snapshot of visible elements. */
  getVisibleElements(): readonly VisibleElement[] {
    return this.buildVisibleList(performance.now());
  }

  /** Current drawing progress 0–100. */
  getProgress(): number {
    if (this.totalExpected === 0) return this.completed ? 100 : 0;
    return Math.min(100, (this.elements.size / this.totalExpected) * 100);
  }

  /** Whether all animations have completed. */
  isIdle(): boolean {
    return (
      this.completed &&
      this.pendingOps.length === 0 &&
      !this.hasActiveAnimations()
    );
  }

  // ── Animation config helpers ──────────────────────────────────────

  /** Determine animation config for an element based on its type. */
  resolveAnimation(element: DrawElement): AnimationConfig {
    const delay = this.addIndex * this.staggerMs;

    switch (element.type) {
      case 'line':
      case 'arrow':
      case 'freehand':
        // Stroke-based elements use drawIn
        return {
          effect: 'drawIn',
          durationMs: 300,
          easingFn: easing.easeOutExpo,
          delayMs: delay,
        };
      case 'text':
        // Text fades in
        return {
          effect: 'fadeIn',
          durationMs: 200,
          easingFn: easing.appleEaseOut,
          delayMs: delay,
        };
      case 'rect':
      case 'ellipse':
      case 'image':
        // Shapes pop in
        return {
          effect: 'popIn',
          durationMs: 250,
          easingFn: easing.easeOutBack,
          delayMs: delay,
        };
      default:
        return { ...DEFAULT_ANIMATION, delayMs: delay };
    }
  }

  // ── rAF scheduling ────────────────────────────────────────────────

  private scheduleTick(): void {
    if (this.dirty || this.paused) return;
    this.dirty = true;
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  private tick(timestamp: number): void {
    this.dirty = false;
    this.rafId = null;

    // 1. Flush pending ops into scene
    this.flushOps(timestamp);

    // 2. Advance animations & build visible list
    const visible = this.buildVisibleList(timestamp);

    // 3. Emit frame callback
    this.callbacks.onFrame?.(visible, this.getProgress());

    // 4. Continue loop if animations are still running
    if (this.hasActiveAnimations() || this.pendingOps.length > 0) {
      this.dirty = true;
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    } else if (this.completed) {
      this.callbacks.onComplete?.();
    }
  }

  private flushOps(timestamp: number): void {
    const ops = this.pendingOps.splice(0);

    for (const op of ops) {
      try {
        this.applyOp(op, timestamp);
      } catch (err) {
        this.callbacks.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }

  private applyOp(op: DrawOp, timestamp: number): void {
    switch (op.op) {
      case 'add': {
        const el = op.element;
        this.elements.set(el.id, el);

        const config = this.resolveAnimation(el);
        this.animations.set(el.id, {
          startTime: timestamp + config.delayMs,
          config,
          progress: 0,
          done: false,
        });

        this.addIndex++;

        if (!this.firstElementEmitted) {
          this.firstElementEmitted = true;
          this.callbacks.onFirstElement?.(el);
        }
        break;
      }

      case 'update': {
        const existing = this.elements.get(op.id);
        if (existing) {
          // Merge patch — instant, no animation
          this.elements.set(op.id, { ...existing, ...op.patch } as DrawElement);
        }
        break;
      }

      case 'delete':
        this.elements.delete(op.id);
        this.animations.delete(op.id);
        break;

      case 'clear':
        this.elements.clear();
        this.animations.clear();
        this.addIndex = 0;
        break;
    }
  }

  // ── Animation evaluation ──────────────────────────────────────────

  private buildVisibleList(timestamp: number): VisibleElement[] {
    const result: VisibleElement[] = [];

    for (const [id, element] of this.elements) {
      const anim = this.animations.get(id);

      if (!anim) {
        // No animation — fully visible instantly
        result.push({
          element,
          animProgress: 1,
          computedOpacity: element.opacity,
          computedScale: 1,
          strokeProgress: 1,
        });
        continue;
      }

      // Compute progress
      const elapsed = timestamp - anim.startTime;
      if (elapsed < 0) {
        // Delayed — not visible yet
        continue;
      }

      const rawT = Math.min(1, elapsed / anim.config.durationMs);
      const easedT = anim.config.easingFn(rawT);
      anim.progress = easedT;
      anim.done = rawT >= 1;

      if (anim.done) {
        this.animations.delete(id);
      }

      result.push(this.computeVisibleElement(element, anim.config, easedT));
    }

    return result;
  }

  private computeVisibleElement(
    element: DrawElement,
    config: AnimationConfig,
    t: number,
  ): VisibleElement {
    switch (config.effect) {
      case 'fadeIn':
        return {
          element,
          animProgress: t,
          computedOpacity: element.opacity * t,
          computedScale: 1,
          strokeProgress: 1,
        };

      case 'drawIn':
        return {
          element,
          animProgress: t,
          computedOpacity: element.opacity,
          computedScale: 1,
          strokeProgress: t,
        };

      case 'popIn': {
        // Scale from 0.85→1 with slight overshoot via easeOutBack
        const scale = 0.85 + 0.15 * t;
        return {
          element,
          animProgress: t,
          computedOpacity: element.opacity * Math.min(1, t * 1.5),
          computedScale: scale,
          strokeProgress: 1,
        };
      }

      case 'none':
      default:
        return {
          element,
          animProgress: 1,
          computedOpacity: element.opacity,
          computedScale: 1,
          strokeProgress: 1,
        };
    }
  }

  private hasActiveAnimations(): boolean {
    return this.animations.size > 0;
  }
}
