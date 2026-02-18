'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhiteboardRenderer } from '@/lib/renderer/WhiteboardRenderer';

// ── Layer types ─────────────────────────────────────────────────────

/** The four compositing layers, rendered back-to-front. */
export type LayerName = 'background' | 'content' | 'activeDraw' | 'cursors';

const LAYER_ORDER: readonly LayerName[] = [
  'background',
  'content',
  'activeDraw',
  'cursors',
] as const;

export interface LayerConfig {
  renderer: WhiteboardRenderer;
  /** When false the layer is skipped entirely. Default true. */
  enabled?: boolean;
}

export interface LayerRenderingOptions {
  /** Map of layer name → renderer + config. */
  layers: Partial<Record<LayerName, LayerConfig>>;
  /** Target FPS — defaults to 60. */
  targetFps?: number;
}

export interface LayerRenderingState {
  /** Whether the RAF loop is currently running. */
  isRendering: boolean;
  /** Pause the render loop without tearing down resources. */
  pause: () => void;
  /** Resume a paused render loop. */
  resume: () => void;
  /** Get the current measured FPS. */
  getFPS: () => number;
}

// ── Dirty-rect tracking per layer ───────────────────────────────────

interface DirtyRect { x: number; y: number; w: number; h: number }

interface LayerDirtyState {
  dirty: boolean;
  rects: DirtyRect[];
}

// ── FPS tracker (minimal, inlined to avoid extra allocations) ───────

const FPS_SAMPLE_COUNT = 60;

// ── Hook ────────────────────────────────────────────────────────────

/**
 * RAF loop that coordinates rendering across four canvas layers.
 *
 * Each layer has its own WhiteboardRenderer and is rendered independently.
 * Dirty-rect tracking is per-layer so clean layers skip work entirely.
 * FPS / frame-time metrics are tracked internally and exposed via `getFPS`.
 */
export function useLayerRendering(
  options: LayerRenderingOptions,
): LayerRenderingState {
  const { layers, targetFps = 60 } = options;

  const [isRendering, setIsRendering] = useState(false);

  // Mutable refs for the hot loop — no React state in the frame path.
  const rafRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const layersRef = useRef(layers);
  const targetFpsRef = useRef(targetFps);

  // Per-layer dirty state keyed by layer name
  const dirtyRef = useRef<Record<string, LayerDirtyState>>({});

  // FPS tracking
  const frameTimesRef = useRef<number[]>([]);
  const lastTimestampRef = useRef(0);
  const fpsRef = useRef(0);

  // Stable ref for the tick fn so rAF can self-schedule without stale closures
  const tickRef = useRef<((ts: number) => void) | null>(null);

  // Keep refs in sync with latest props
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { targetFpsRef.current = targetFps; }, [targetFps]);

  // ── Dirty-rect helpers ────────────────────────────────────────────

  const markLayerDirty = useCallback((name: LayerName) => {
    const state = dirtyRef.current[name];
    if (state) {
      state.dirty = true;
      state.rects.length = 0;
    } else {
      dirtyRef.current[name] = { dirty: true, rects: [] };
    }
  }, []);

  // ── Frame loop (stored in ref to break circular dependency) ───────

  useEffect(() => {
    tickRef.current = (timestamp: number) => {
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(tickRef.current!);
        return;
      }

      // Frame-time tracking
      if (lastTimestampRef.current > 0) {
        const delta = timestamp - lastTimestampRef.current;
        const frameTimes = frameTimesRef.current;
        frameTimes.push(delta);
        if (frameTimes.length > FPS_SAMPLE_COUNT) {
          frameTimes.shift();
        }
        const sum = frameTimes.reduce((a, b) => a + b, 0);
        fpsRef.current = frameTimes.length > 0 ? (1000 * frameTimes.length) / sum : 0;
      }
      lastTimestampRef.current = timestamp;

      const frameBudget = 1000 / targetFpsRef.current;
      const currentLayers = layersRef.current;

      for (const name of LAYER_ORDER) {
        const cfg = currentLayers[name];
        if (!cfg || cfg.enabled === false) continue;

        const dirty = dirtyRef.current[name];
        const { renderer } = cfg;

        renderer.perfMonitor.tick(timestamp);

        const renderStart = performance.now();

        if (dirty?.dirty) {
          renderer.renderFull();
          dirty.dirty = false;
          dirty.rects.length = 0;
        }

        renderer.perfMonitor.recordRender(performance.now() - renderStart);

        // Budget check: defer remaining layers to avoid jank
        if (performance.now() - timestamp > frameBudget) {
          const idx = LAYER_ORDER.indexOf(name);
          for (let i = idx + 1; i < LAYER_ORDER.length; i++) {
            markLayerDirty(LAYER_ORDER[i]!);
          }
          break;
        }
      }

      rafRef.current = requestAnimationFrame(tickRef.current!);
    };
  }, [markLayerDirty]);

  // ── Lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    // Initialise dirty state for all provided layers
    for (const name of LAYER_ORDER) {
      if (layers[name]) {
        dirtyRef.current[name] = { dirty: true, rects: [] };
      }
    }

    pausedRef.current = false;

    const startTick = (ts: number) => tickRef.current?.(ts);
    rafRef.current = requestAnimationFrame(startTick);

    // Defer state update to avoid synchronous setState in effect body
    queueMicrotask(() => setIsRendering(true));

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      queueMicrotask(() => setIsRendering(false));
    };
  }, [layers]);

  // ── Public API ────────────────────────────────────────────────────

  const pause = useCallback(() => {
    pausedRef.current = true;
    setIsRendering(false);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    lastTimestampRef.current = 0; // reset so first resumed frame isn't a huge delta
    setIsRendering(true);
  }, []);

  const getFPS = useCallback(() => fpsRef.current, []);

  return { isRendering, pause, resume, getFPS };
}
