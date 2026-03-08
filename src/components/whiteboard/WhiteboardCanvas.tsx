'use client';

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ActiveStroke, DrawBatch, DrawElement, LineStyle, StrokeTrajectory } from '@/types/agent';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { createActiveBatch, easeOutCubic, easeInOutCubic, prefersReducedMotion, weightedVisibleLength } from '@/lib/whiteboard/stroke-scheduler';
import type { BatchCompleteCallback } from '@/lib/whiteboard/stroke-scheduler';
import { useIsMobile } from '@/hooks/useIsMobile';
import { normalizeBatchTextSpacingAgainstScene } from '@/lib/whiteboard/layout-spacing';
import {
  partialPolylineByLength,
  screenStrokePx,
  computeFitCamera,
  clamp,
  strokesBoundingBox,
} from '@/lib/whiteboard/geometry';
import { drawSmoothStroke, drawStroke as drawStrokeImported, drawTextFallback } from '@/lib/whiteboard/canvas-draw';
import { computeFps, isDebugShortcut, createDrawCallCounter, formatFps } from '@/lib/whiteboard/canvas-debug';
import type { WhiteboardExportHandle } from '@/lib/whiteboard/canvas-export';
import {
  renderStrokesToBlob,
  copyCanvasLayersToClipboard,
  exportStrokesToSVG,
  DEFAULT_EXPORT_OPTIONS,
} from '@/lib/whiteboard/canvas-export';
import { ExportButton } from '@/components/whiteboard/ExportButton';
import { KeyboardShortcutsHelp } from '@/components/whiteboard/KeyboardShortcutsHelp';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface WhiteboardCanvasProps {
  batches: DrawBatch[];
  onWarning: (warning: string) => void;
  /** Fired when all strokes in a batch finish animating. */
  onBatchAnimationComplete?: BatchCompleteCallback;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const MAX_COMMITTED = 2000;

const COLLINEARITY_EPSILON = 1e-4;

/**
 * Returns true if all points are (approximately) collinear.
 * Uses the cross-product of consecutive segments against the first direction.
 */
function isCollinear(points: { x: number; y: number }[]): boolean {
  if (points.length <= 2) return true;
  for (let i = 2; i < points.length; i++) {
    const ax = points[i - 1]!.x - points[i - 2]!.x;
    const ay = points[i - 1]!.y - points[i - 2]!.y;
    const bx = points[i]!.x - points[i - 1]!.x;
    const by = points[i]!.y - points[i - 1]!.y;
    if (Math.abs(ax * by - ay * bx) > COLLINEARITY_EPSILON) return false;
  }
  return true;
}

/**
 * Simple segment-by-segment lineTo stroke for straight lines and short strokes.
 */
function drawLinearStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokeTrajectory['points'],
  color: string,
  baseWidth: number,
  camera: Camera,
  dpr: number,
  options?: { lineStyle?: LineStyle; mathematical?: boolean },
) {
  drawStrokeImported(ctx, points, color, baseWidth, camera, dpr, options);
}

/**
 * Draw a stroke, choosing Catmull-Rom splines for curved freehand strokes
 * and simple lineTo for straight-line/collinear segments (F1 fix).
 */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokeTrajectory['points'],
  color: string,
  baseWidth: number,
  camera: Camera,
  dpr: number,
  options?: { lineStyle?: LineStyle; mathematical?: boolean },
) {
  if (points.length <= 2 || isCollinear(points)) {
    drawLinearStroke(ctx, points, color, baseWidth, camera, dpr, options);
  } else {
    drawSmoothStroke(ctx, points, color, baseWidth, camera, dpr, options);
  }
}

const MAX_RETRY_ATTEMPTS = 3;

const WhiteboardCanvasInner = forwardRef<WhiteboardExportHandle, WhiteboardCanvasProps>(
  function WhiteboardCanvasInner({ batches, onWarning, onBatchAnimationComplete }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const committedRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<HTMLCanvasElement>(null);

  const isMobile = useIsMobile();
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const mobileToolbarRef = useRef<HTMLDivElement>(null);

  // Close mobile toolbar on outside click
  useEffect(() => {
    if (!toolbarOpen) return;
    const handler = (e: MouseEvent) => {
      if (mobileToolbarRef.current && !mobileToolbarRef.current.contains(e.target as Node)) {
        setToolbarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [toolbarOpen]);

  const committedStrokesRef = useRef<StrokeTrajectory[]>([]);
  const activeStrokesRef = useRef<ActiveStroke[]>([]);
  const committedDirtyRef = useRef(true);

  // Batch completion tracking: maps batchId → count of still-animating strokes
  const pendingBatchStrokesRef = useRef<Map<string, number>>(new Map());
  const onBatchAnimationCompleteRef = useRef(onBatchAnimationComplete);
  onBatchAnimationCompleteRef.current = onBatchAnimationComplete;

  const gridColorsRef = useRef({ bg: '#f7f9fc', stroke: 'rgba(77, 93, 118, 0.16)' });

  const gridDirtyRef = useRef(false);

  // Animated camera transition state
  const cameraAnimRef = useRef<number | null>(null);

  // Drawing progress tracking for progress bar
  const batchTotalStrokesRef = useRef<Map<string, number>>(new Map());
  const progressElRef = useRef<HTMLDivElement>(null);

  // clearCanvas and fitToContent refs — assigned after definition,
  // referenced by useImperativeHandle (moved after fitToContent).
  const clearCanvasRef = useRef<() => void>(() => {});
  const fitToContentRef = useRef<() => void>(() => {});

  // Self-ref for the ExportButton inside the canvas component
  const selfExportRef = useRef<WhiteboardExportHandle>(null);

  // Keep selfExportRef in sync with the imperative handle
  useEffect(() => {
    (selfExportRef as React.MutableRefObject<WhiteboardExportHandle | null>).current = {
      async exportAsPNG(scale = 2, whiteBackground = true) {
        const allStrokes: StrokeTrajectory[] = [
          ...committedStrokesRef.current,
          ...activeStrokesRef.current,
        ];
        const { blob } = await renderStrokesToBlob(allStrokes, {
          ...DEFAULT_EXPORT_OPTIONS,
          scale,
          whiteBackground,
        });
        return blob;
      },
      exportAsSVG() {
        const allStrokes: StrokeTrajectory[] = [
          ...committedStrokesRef.current,
          ...activeStrokesRef.current,
        ];
        return exportStrokesToSVG(allStrokes);
      },
      async copyToClipboard() {
        const bg = bgRef.current;
        const committed = committedRef.current;
        const active = activeRef.current;
        if (!bg || !committed || !active) throw new Error('Canvas layers not available');
        await copyCanvasLayersToClipboard(bg, committed, active);
      },
      getStrokeData() {
        return [...committedStrokesRef.current, ...activeStrokesRef.current];
      },
      getContentBounds() {
        const allStrokes: StrokeTrajectory[] = [
          ...committedStrokesRef.current,
          ...activeStrokesRef.current,
        ];
        if (allStrokes.length === 0) return null;
        const bounds = strokesBoundingBox(allStrokes, 0);
        return bounds
          ? { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY }
          : null;
      },
      clearCanvas() { clearCanvasRef.current(); },
      fitToContent() { fitToContentRef.current(); },
    };
  });

  const readGridColors = useCallback(() => {
    const style = getComputedStyle(document.documentElement);
    gridColorsRef.current = {
      bg: style.getPropertyValue('--color-grid-bg').trim() || '#f7f9fc',
      stroke: style.getPropertyValue('--color-grid').trim() || 'rgba(77, 93, 118, 0.16)',
    };
    gridDirtyRef.current = true;
  }, []);

  useEffect(() => {
    readGridColors();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          readGridColors();
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [readGridColors]);

  const processedBatchIdsRef = useRef<Set<string>>(new Set());
  const pendingCompilesRef = useRef(0);
  const MAX_PROCESSED_BATCH_IDS = 500;
  const clearGenerationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const drawErrorCountRef = useRef(0);
  const retryAttemptsRef = useRef(0);

  const [renderError, setRenderError] = useState(false);
  const [batchAnnouncement, setBatchAnnouncement] = useState('');

  // Derive a human-readable description of the drawing content for screen readers
  const drawingDescription = useMemo(() => {
    if (batches.length === 0) return 'Whiteboard is empty.';
    const typeCounts: Partial<Record<DrawElement['type'], number>> = {};
    let totalElements = 0;
    for (const batch of batches) {
      for (const el of batch.elements) {
        typeCounts[el.type] = (typeCounts[el.type] ?? 0) + 1;
        totalElements++;
      }
    }
    const types = Object.entries(typeCounts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    return `Drawing contains ${totalElements} element${totalElements === 1 ? '' : 's'} across ${batches.length} batch${batches.length === 1 ? '' : 'es'} including ${types}.`;
  }, [batches]);

  // Whether the scene has no visible content (for disabling export)
  const sceneEmpty = batches.length === 0;

  // Store onWarning in a ref to avoid re-running batch effect on callback identity changes
  const onWarningRef = useRef(onWarning);
  onWarningRef.current = onWarning;

  // Camera/dpr/size stored as refs so RAF loop doesn't restart on changes (C1 fix)
  const cameraRef = useRef<Camera>({ x: 40, y: 40, zoom: 1 });
  const dprRef = useRef(1);
  const sizeRef = useRef({ width: 1000, height: 700 });
  // Track previous camera for grid dirty check
  const prevCameraRef = useRef<Camera>({ x: 40, y: 40, zoom: 1 });
  const prevSizeRef = useRef({ width: 1000, height: 700 });

  // Stats displayed via refs + direct DOM updates to avoid React re-renders (C2 fix)
  const statsRef = useRef({ active: 0, committed: 0 });
  const statsZoomElRef = useRef<HTMLElement>(null);
  const statsCommittedElRef = useRef<HTMLDivElement>(null);
  const statsActiveElRef = useRef<HTMLDivElement>(null);

  const debugVisibleRef = useRef(false);
  const statsFpsElRef = useRef<HTMLDivElement>(null);
  const statsDrawCallsElRef = useRef<HTMLDivElement>(null);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(0);
  const drawCallCounterRef = useRef(createDrawCallCounter());

  const resetCamera = useCallback(() => {
    cameraRef.current = { x: 40, y: 40, zoom: 1 };
    committedDirtyRef.current = true;
  }, []);
  const zoomIn = useCallback(() => {
    const c = cameraRef.current;
    cameraRef.current = { ...c, zoom: clamp(c.zoom * 1.25, MIN_ZOOM, MAX_ZOOM) };
    committedDirtyRef.current = true;
  }, []);
  const zoomOut = useCallback(() => {
    const c = cameraRef.current;
    cameraRef.current = { ...c, zoom: clamp(c.zoom / 1.25, MIN_ZOOM, MAX_ZOOM) };
    committedDirtyRef.current = true;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isDebugShortcut(e)) {
        debugVisibleRef.current = !debugVisibleRef.current;
        const overlay = containerRef.current?.querySelector('[data-testid="debug-overlay"]') as HTMLElement | null;
        if (overlay) overlay.style.display = debugVisibleRef.current ? '' : 'none';
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const resizeCanvases = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // Guard: skip resize if container has no renderable area
    if (rect.width < 1 || rect.height < 1) return;
    const nextDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 5));

    dprRef.current = nextDpr;
    sizeRef.current = { width: rect.width, height: rect.height };

    [bgRef.current, committedRef.current, activeRef.current].forEach((canvas) => {
      if (!canvas) return;
      canvas.width = Math.floor(rect.width * nextDpr);
      canvas.height = Math.floor(rect.height * nextDpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    });

    committedDirtyRef.current = true;
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => resizeCanvases());
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedResize = () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => resizeCanvases(), 100);
    };
    window.addEventListener('resize', debouncedResize);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        committedDirtyRef.current = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // DPR change detection (RENDER-001 fix): re-initialize canvas on DPR change
    const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onDprChange = () => resizeCanvases();
    dprQuery.addEventListener('change', onDprChange);

    return () => {
      cancelAnimationFrame(raf);
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      dprQuery.removeEventListener('change', onDprChange);
    };
  }, [resizeCanvases]);

  useEffect(() => {
    let cancelled = false;

    const process = async () => {
      for (const batch of batches) {
        if (cancelled) {
          pendingCompilesRef.current = Math.max(0, pendingCompilesRef.current - 1);
          return;
        }
        if (processedBatchIdsRef.current.has(batch.batch_id)) continue;
        processedBatchIdsRef.current.add(batch.batch_id);
        pendingCompilesRef.current += 1;

        // Prune to prevent unbounded growth
        if (processedBatchIdsRef.current.size > MAX_PROCESSED_BATCH_IDS) {
          const ids = processedBatchIdsRef.current.values();
          const excess = processedBatchIdsRef.current.size - MAX_PROCESSED_BATCH_IDS;
          for (let i = 0; i < excess; i++) {
            const next = ids.next();
            if (!next.done) processedBatchIdsRef.current.delete(next.value);
          }
        }

        let compiled;
        try {
          compiled = await compileBatchToStrokes(batch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onWarningRef.current(`Failed to compile batch ${batch.batch_id}: ${msg}`);
          pendingCompilesRef.current = Math.max(0, pendingCompilesRef.current - 1);
          continue;
        }
        if (cancelled) return;

        if (compiled.clear) {
          committedStrokesRef.current = [];
          activeStrokesRef.current = [];
          // Fix N4: clear processed IDs to prevent unbounded memory growth
          processedBatchIdsRef.current.clear();
          processedBatchIdsRef.current.add(batch.batch_id);
          // Fix N5: bump generation so RAF loop discards pre-clear completed strokes
          clearGenerationRef.current += 1;
          committedDirtyRef.current = true;
        }

        compiled.warnings.forEach((w) => onWarningRef.current(w));

        if (compiled.strokes.length > 0) {
          normalizeBatchTextSpacingAgainstScene(
            batch,
            compiled.strokes,
            committedStrokesRef.current.concat(activeStrokesRef.current),
          );
          const rm = prefersReducedMotion();
          if (rm) {
            // Reduced motion: commit strokes immediately, no animation
            committedStrokesRef.current = committedStrokesRef.current.concat(compiled.strokes);
            committedDirtyRef.current = true;
            onBatchAnimationCompleteRef.current?.(batch.batch_id);
          } else {
            // Injection batches use staggered animation for sequential draw order
            const isInjection = batch.source === 'injection';
            const active = createActiveBatch(
              compiled.strokes,
              performance.now(),
              isInjection,
              false,
              batch.source,
            );

            // Separate instant strokes (durationMs === 0) from animated ones
            const instantStrokes: StrokeTrajectory[] = [];
            const animatedStrokes: ActiveStroke[] = [];
            for (const s of active) {
              if (s.durationMs === 0) {
                instantStrokes.push(s);
              } else {
                animatedStrokes.push(s);
              }
            }

            // Commit instant strokes immediately
            if (instantStrokes.length > 0) {
              committedStrokesRef.current = committedStrokesRef.current.concat(instantStrokes);
              committedDirtyRef.current = true;
            }

            if (animatedStrokes.length > 0) {
              activeStrokesRef.current.push(...animatedStrokes);
              // Track how many strokes remain for batch completion callback
              pendingBatchStrokesRef.current.set(
                batch.batch_id,
                (pendingBatchStrokesRef.current.get(batch.batch_id) ?? 0) + animatedStrokes.length,
              );
              // Track total for progress bar
              const totalAnimated = instantStrokes.length + animatedStrokes.length;
              batchTotalStrokesRef.current.set(batch.batch_id, totalAnimated);
              // Tag each stroke with its batchId for completion tracking
              for (const s of animatedStrokes) {
                (s as ActiveStroke & { _batchId?: string })._batchId = batch.batch_id;
              }
            } else {
              // All strokes were instant — batch is already complete
              onBatchAnimationCompleteRef.current?.(batch.batch_id);
            }

            // Injection batches: auto-pan if content is mostly off-screen
            if (isInjection && compiled.strokes.length > 0) {
              const allStrokesBounds = compiled.strokes.reduce(
                (acc, s) => {
                  if (!s.bounds) return acc;
                  return {
                    minX: Math.min(acc.minX, s.bounds.minX),
                    minY: Math.min(acc.minY, s.bounds.minY),
                    maxX: Math.max(acc.maxX, s.bounds.maxX),
                    maxY: Math.max(acc.maxY, s.bounds.maxY),
                  };
                },
                { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
              );
              if (isFinite(allStrokesBounds.minX)) {
                const cam = cameraRef.current;
                const vpMinX = -cam.x / cam.zoom;
                const vpMinY = -cam.y / cam.zoom;
                const vpMaxX = vpMinX + sizeRef.current.width / cam.zoom;
                const vpMaxY = vpMinY + sizeRef.current.height / cam.zoom;
                // Check if content center is outside viewport
                const cx = (allStrokesBounds.minX + allStrokesBounds.maxX) / 2;
                const cy = (allStrokesBounds.minY + allStrokesBounds.maxY) / 2;
                const isOffScreen = cx < vpMinX || cx > vpMaxX || cy < vpMinY || cy > vpMaxY;
                if (isOffScreen) {
                  animateCameraToContent(allStrokesBounds);
                }
              }
            }
          }
        }
        pendingCompilesRef.current = Math.max(0, pendingCompilesRef.current - 1);
      }

      // Announce new content to screen readers
      if (batches.length > 0) {
        const typeCounts: Partial<Record<DrawElement['type'], number>> = {};
        let total = 0;
        for (const b of batches) {
          for (const el of b.elements) {
            typeCounts[el.type] = (typeCounts[el.type] ?? 0) + 1;
            total++;
          }
        }
        const types = Object.keys(typeCounts).join(', ');
        setBatchAnnouncement(
          `Drawing updated: ${total} element${total === 1 ? '' : 's'} including ${types}.`,
        );
      }
    };

    void process().catch((err: unknown) => {
      if (!cancelled) {
        onWarningRef.current(`Batch compilation failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [batches]);

  // RAF loop generation: incrementing restarts the loop via useEffect dependency
  const [rafGeneration, setRafGeneration] = useState(0);

  useEffect(() => {
    let lastClearGeneration = clearGenerationRef.current;

    const drawFrame = () => {
      try {
      const bgCanvas = bgRef.current;
      const committedCanvas = committedRef.current;
      const activeCanvas = activeRef.current;
      if (!bgCanvas || !committedCanvas || !activeCanvas) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const bgCtx = bgCanvas.getContext('2d');
      const committedCtx = committedCanvas.getContext('2d');
      const activeCtx = activeCanvas.getContext('2d');
      if (!bgCtx || !committedCtx || !activeCtx) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const camera = cameraRef.current;
      const dpr = dprRef.current;
      const size = sizeRef.current;

      // FPS tracking
      const frameNow = performance.now();
      if (lastFrameTimeRef.current > 0) {
        const delta = frameNow - lastFrameTimeRef.current;
        const ft = frameTimesRef.current;
        ft.push(delta);
        if (ft.length > 60) ft.shift();
      }
      lastFrameTimeRef.current = frameNow;
      drawCallCounterRef.current.reset();

      const scale = dpr * camera.zoom;
      const tx = camera.x * dpr;
      const ty = camera.y * dpr;

      // Grid caching: only redraw background when camera or size changed (C6 fix)
      const prev = prevCameraRef.current;
      const prevSize = prevSizeRef.current;
      const cameraChanged =
        prev.x !== camera.x || prev.y !== camera.y || prev.zoom !== camera.zoom ||
        prevSize.width !== size.width || prevSize.height !== size.height ||
        gridDirtyRef.current;

      if (cameraChanged) {
        prevCameraRef.current = { ...camera };
        prevSizeRef.current = { ...size };
        committedDirtyRef.current = true;
        gridDirtyRef.current = false;

        bgCtx.setTransform(1, 0, 0, 1, 0, 0);
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.fillStyle = gridColorsRef.current.bg;
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        bgCtx.setTransform(scale, 0, 0, scale, tx, ty);

        // Adaptive grid density based on zoom level (F5 fix)
        const baseGrid = 30;
        let gridStep: number;
        let gridOpacity: number;
        if (camera.zoom < 0.5) {
          // Low zoom: major gridlines only (every 4× base)
          gridStep = baseGrid * 4;
          gridOpacity = 0.12;
        } else if (camera.zoom > 2) {
          // High zoom: fine grid (every 0.5× base)
          gridStep = baseGrid / 2;
          gridOpacity = 0.08;
        } else {
          gridStep = baseGrid;
          gridOpacity = 0.16;
        }
        const baseColor = gridColorsRef.current.stroke;
        // Derive rgb from base color string; fall back to default if parsing fails
        const rgbMatch = baseColor.match(/[\d.]+/g);
        const gridColor = rgbMatch && rgbMatch.length >= 3
          ? `rgba(${rgbMatch[0]}, ${rgbMatch[1]}, ${rgbMatch[2]}, ${gridOpacity})`
          : `rgba(77, 93, 118, ${gridOpacity})`;

        bgCtx.strokeStyle = gridColor;
        bgCtx.lineWidth = 1 / scale;

        const minX = -camera.x / camera.zoom - gridStep;
        const minY = -camera.y / camera.zoom - gridStep;
        const maxX = minX + size.width / camera.zoom + gridStep * 2;
        const maxY = minY + size.height / camera.zoom + gridStep * 2;

        for (let x = Math.floor(minX / gridStep) * gridStep; x <= maxX; x += gridStep) {
          bgCtx.beginPath();
          bgCtx.moveTo(x, minY);
          bgCtx.lineTo(x, maxY);
          bgCtx.stroke();
        }

        for (let y = Math.floor(minY / gridStep) * gridStep; y <= maxY; y += gridStep) {
          bgCtx.beginPath();
          bgCtx.moveTo(minX, y);
          bgCtx.lineTo(maxX, y);
          bgCtx.stroke();
        }
      }

      // Viewport bounds in world space for culling
      const vpMinX = -camera.x / camera.zoom;
      const vpMinY = -camera.y / camera.zoom;
      const vpMaxX = vpMinX + size.width / camera.zoom;
      const vpMaxY = vpMinY + size.height / camera.zoom;
      const cullMargin = 50;

      // Committed layer: only redraw when dirty
      if (committedDirtyRef.current) {
        committedCtx.setTransform(1, 0, 0, 1, 0, 0);
        committedCtx.clearRect(0, 0, committedCanvas.width, committedCanvas.height);
        committedCtx.setTransform(scale, 0, 0, scale, tx, ty);

        for (const stroke of committedStrokesRef.current) {
          if (stroke.bounds) {
            const b = stroke.bounds;
            if (b.maxX < vpMinX - cullMargin || b.minX > vpMaxX + cullMargin ||
                b.maxY < vpMinY - cullMargin || b.minY > vpMaxY + cullMargin) {
              continue;
            }
          }
          drawStroke(committedCtx, stroke.points, stroke.color, stroke.baseWidth, camera, dpr,
            { lineStyle: stroke.lineStyle, mathematical: stroke.mathematical });
          if (stroke.textFallback) {
            drawTextFallback(committedCtx, stroke.textFallback.text, stroke.textFallback.x, stroke.textFallback.y, stroke.textFallback.fontSize, stroke.color, camera, dpr);
          }
          drawCallCounterRef.current.increment();
        }
        committedDirtyRef.current = false;
      }

      // Skip active layer when no strokes are animating
      if (activeStrokesRef.current.length === 0) {
        if (statsRef.current.active > 0) {
          // Clear once when transitioning from active→empty
          activeCtx.setTransform(1, 0, 0, 1, 0, 0);
          activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }
      } else {
      activeCtx.setTransform(1, 0, 0, 1, 0, 0);
      activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
      activeCtx.setTransform(scale, 0, 0, scale, tx, ty);

      const now = performance.now();
      const nextActive: ActiveStroke[] = [];
      const completed: StrokeTrajectory[] = [];

      for (const stroke of activeStrokesRef.current) {
        const rawT = easeOutCubic((now - stroke.startedAt) / stroke.durationMs);
        const visibleLength =
          stroke.speedFactors && stroke.speedFactors.length === stroke.cumulativeLengths.length
            ? weightedVisibleLength(stroke.cumulativeLengths, stroke.speedFactors, rawT)
            : stroke.length * rawT;
        const partial = partialPolylineByLength(stroke.points, stroke.cumulativeLengths, visibleLength);

        if (stroke.bounds) {
          const b = stroke.bounds;
          if (b.maxX < vpMinX - cullMargin || b.minX > vpMaxX + cullMargin ||
              b.maxY < vpMinY - cullMargin || b.minY > vpMaxY + cullMargin) {
            if (rawT >= 1) { completed.push(stroke); } else { nextActive.push(stroke); }
            continue;
          }
        }

        drawStroke(activeCtx, partial, stroke.color, stroke.baseWidth, camera, dpr,
            { lineStyle: stroke.lineStyle, mathematical: stroke.mathematical });
          if (stroke.textFallback && rawT >= 1) {
            drawTextFallback(activeCtx, stroke.textFallback.text, stroke.textFallback.x, stroke.textFallback.y, stroke.textFallback.fontSize, stroke.color, camera, dpr);
          }
          drawCallCounterRef.current.increment();

        if (rawT >= 1) {
          completed.push(stroke);
        } else {
          nextActive.push(stroke);
        }
      }

      // Fix N5: discard completed strokes if a clear happened mid-frame (zombie stroke fix)
      const currentGen = clearGenerationRef.current;
      if (completed.length > 0 && currentGen === lastClearGeneration) {
        committedStrokesRef.current = committedStrokesRef.current.concat(completed);
        if (committedStrokesRef.current.length > MAX_COMMITTED) {
          committedStrokesRef.current = committedStrokesRef.current.slice(-MAX_COMMITTED);
        }
        committedDirtyRef.current = true;

        // Batch completion tracking
        const batchCounters = pendingBatchStrokesRef.current;
        for (const stroke of completed) {
          const batchId = (stroke as ActiveStroke & { _batchId?: string })._batchId;
          if (batchId && batchCounters.has(batchId)) {
            const remaining = (batchCounters.get(batchId) ?? 1) - 1;
            if (remaining <= 0) {
              batchCounters.delete(batchId);
              batchTotalStrokesRef.current.delete(batchId);
              onBatchAnimationCompleteRef.current?.(batchId);
            } else {
              batchCounters.set(batchId, remaining);
            }
          }
        }

        // Update progress bar: compute aggregate progress across all animating batches
        if (batchTotalStrokesRef.current.size > 0) {
          let totalAll = 0;
          let remainingAll = 0;
          for (const [bid, total] of batchTotalStrokesRef.current) {
            totalAll += total;
            remainingAll += batchCounters.get(bid) ?? 0;
          }
          const progress = totalAll > 0 ? (totalAll - remainingAll) / totalAll : 1;
          const el = progressElRef.current;
          if (el) {
            el.style.setProperty('--progress', String(progress));
            el.style.opacity = '1';
          }
        }
        // Fade out progress bar when no batches are animating
        if (batchCounters.size === 0 && batchTotalStrokesRef.current.size === 0) {
          const el = progressElRef.current;
          if (el) {
            el.style.setProperty('--progress', '1');
            el.style.opacity = '0';
          }
        }
      }
      lastClearGeneration = currentGen;
      activeStrokesRef.current = nextActive;
      } // end active strokes else-branch

      // Fix C2: update stats via direct DOM mutation instead of setState
      const nextActive_count = activeStrokesRef.current.length;
      const displayActiveCount = nextActive_count + pendingCompilesRef.current;
      const nextCommitted_count = committedStrokesRef.current.length;
      if (statsRef.current.active !== displayActiveCount || statsRef.current.committed !== nextCommitted_count) {
        statsRef.current = { active: displayActiveCount, committed: nextCommitted_count };
        const displayCommitted = nextCommitted_count > 0 ? nextCommitted_count : displayActiveCount;
        if (statsCommittedElRef.current) statsCommittedElRef.current.textContent = `Committed: ${displayCommitted}`;
        if (statsActiveElRef.current) statsActiveElRef.current.textContent = `Active: ${displayActiveCount}`;
      }
      // Update zoom display on camera change
      if (cameraChanged && statsZoomElRef.current) {
        statsZoomElRef.current.textContent = `Zoom: ${(camera.zoom * 100).toFixed(0)}%`;
      }

      // Update FPS and draw-call stats when debug overlay is visible
      if (debugVisibleRef.current) {
        const fps = computeFps(frameTimesRef.current);
        if (statsFpsElRef.current) statsFpsElRef.current.textContent = `FPS: ${formatFps(fps)}`;
        if (statsDrawCallsElRef.current) statsDrawCallsElRef.current.textContent = `Draws: ${drawCallCounterRef.current.read()}`;
      }

      drawErrorCountRef.current = 0;
      } catch (err) {
        drawErrorCountRef.current += 1;
        console.error('WhiteboardCanvas draw error:', err);
        if (drawErrorCountRef.current >= 10) {
          onWarningRef.current('Rendering paused due to repeated errors. Try resizing the window.');
          setRenderError(true);
          rafRef.current = null;
          return;
        }
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [rafGeneration]);

  const fitToContent = useCallback(() => {
    const strokes = committedStrokesRef.current;
    if (strokes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) {
      if (s.bounds) {
        if (s.bounds.minX < minX) minX = s.bounds.minX;
        if (s.bounds.minY < minY) minY = s.bounds.minY;
        if (s.bounds.maxX > maxX) maxX = s.bounds.maxX;
        if (s.bounds.maxY > maxY) maxY = s.bounds.maxY;
      } else {
        for (const p of s.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
    }
    if (!isFinite(minX)) return;
    const result = computeFitCamera(
      { minX, minY, maxX, maxY },
      sizeRef.current.width,
      sizeRef.current.height,
      MIN_ZOOM,
      MAX_ZOOM,
    );
    if (!result) return;
    cameraRef.current = result;
    committedDirtyRef.current = true;
  }, []);

  /** Smoothly animate the camera to show the given bounding box.
   *  Prefers panning to zooming — only zooms out if content doesn't fit. */
  const animateCameraToContent = useCallback((
    contentBounds: { minX: number; minY: number; maxX: number; maxY: number },
  ) => {
    // Cancel any in-progress camera animation
    if (cameraAnimRef.current !== null) {
      cancelAnimationFrame(cameraAnimRef.current);
      cameraAnimRef.current = null;
    }

    const { width, height } = sizeRef.current;
    const target = computeFitCamera(contentBounds, width, height, MIN_ZOOM, MAX_ZOOM);
    if (!target) return;

    // Prefer panning: if current zoom can show the content, keep it
    const current = cameraRef.current;
    const contentW = contentBounds.maxX - contentBounds.minX;
    const contentH = contentBounds.maxY - contentBounds.minY;
    const padding = 40;
    const fitsAtCurrentZoom =
      contentW * current.zoom + padding * 2 <= width &&
      contentH * current.zoom + padding * 2 <= height;

    const targetCamera = fitsAtCurrentZoom
      ? {
          x: width / 2 - (contentBounds.minX + contentW / 2) * current.zoom,
          y: height / 2 - (contentBounds.minY + contentH / 2) * current.zoom,
          zoom: current.zoom,
        }
      : target;

    const startCamera = { ...current };
    const duration = 400; // ms
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = easeInOutCubic(Math.min(1, elapsed / duration));

      cameraRef.current = {
        x: startCamera.x + (targetCamera.x - startCamera.x) * t,
        y: startCamera.y + (targetCamera.y - startCamera.y) * t,
        zoom: startCamera.zoom + (targetCamera.zoom - startCamera.zoom) * t,
      };
      committedDirtyRef.current = true;

      if (t < 1) {
        cameraAnimRef.current = requestAnimationFrame(animate);
      } else {
        cameraAnimRef.current = null;
      }
    };

    cameraAnimRef.current = requestAnimationFrame(animate);
  }, []);

  const clearCanvas = useCallback(() => {
    committedStrokesRef.current = [];
    activeStrokesRef.current = [];
    processedBatchIdsRef.current.clear();
    clearGenerationRef.current += 1;
    committedDirtyRef.current = true;
    cameraRef.current = { x: 40, y: 40, zoom: 1 };
    batchTotalStrokesRef.current.clear();
    if (cameraAnimRef.current !== null) {
      cancelAnimationFrame(cameraAnimRef.current);
      cameraAnimRef.current = null;
    }
  }, []);

  // Keep refs in sync for useImperativeHandle
  clearCanvasRef.current = clearCanvas;
  fitToContentRef.current = fitToContent;

  // Expose imperative handle to parent via forwardRef
  useImperativeHandle(ref, () => ({
    async exportAsPNG(scale = 2, whiteBackground = true) {
      const allStrokes: StrokeTrajectory[] = [
        ...committedStrokesRef.current,
        ...activeStrokesRef.current,
      ];
      const { blob } = await renderStrokesToBlob(allStrokes, {
        ...DEFAULT_EXPORT_OPTIONS,
        scale,
        whiteBackground,
      });
      return blob;
    },

    exportAsSVG() {
      const allStrokes: StrokeTrajectory[] = [
        ...committedStrokesRef.current,
        ...activeStrokesRef.current,
      ];
      return exportStrokesToSVG(allStrokes);
    },

    async copyToClipboard() {
      const bg = bgRef.current;
      const committed = committedRef.current;
      const active = activeRef.current;
      if (!bg || !committed || !active) {
        throw new Error('Canvas layers not available');
      }
      await copyCanvasLayersToClipboard(bg, committed, active);
    },

    getStrokeData() {
      return [
        ...committedStrokesRef.current,
        ...activeStrokesRef.current,
      ];
    },

    getContentBounds() {
      const allStrokes: StrokeTrajectory[] = [
        ...committedStrokesRef.current,
        ...activeStrokesRef.current,
      ];
      if (allStrokes.length === 0) return null;
      const bounds = strokesBoundingBox(allStrokes, 0);
      return bounds
        ? { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY }
        : null;
    },

    clearCanvas() {
      clearCanvasRef.current();
    },

    fitToContent() {
      fitToContentRef.current();
    },
  }), []);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const handleClearWithConfirm = useCallback(() => {
    const hasContent = committedStrokesRef.current.length > 0 || activeStrokesRef.current.length > 0;
    if (!hasContent) return;
    setShowClearConfirm(true);
  }, []);
  const confirmClear = useCallback(() => {
    clearCanvas();
    setShowClearConfirm(false);
  }, [clearCanvas]);
  const cancelClear = useCallback(() => {
    setShowClearConfirm(false);
  }, []);

  const retryRendering = useCallback(() => {
    if (retryAttemptsRef.current >= MAX_RETRY_ATTEMPTS) return;
    retryAttemptsRef.current += 1;
    drawErrorCountRef.current = 0;
    setRenderError(false);
    committedDirtyRef.current = true;
    setRafGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isPanning = false;
    let lastX = 0;
    let lastY = 0;

    // Pinch-to-zoom: track active pointers
    const activePointers = new Map<number, { x: number; y: number }>();
    let lastPinchDist = 0;

    function getPinchDistance(): number {
      const pts = Array.from(activePointers.values());
      if (pts.length < 2) return 0;
      const dx = pts[1]!.x - pts[0]!.x;
      const dy = pts[1]!.y - pts[0]!.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getPinchCenter(): { x: number; y: number } {
      const pts = Array.from(activePointers.values());
      return {
        x: (pts[0]!.x + pts[1]!.x) / 2,
        y: (pts[0]!.y + pts[1]!.y) / 2,
      };
    }

    const onPointerDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        // Entering pinch mode — cancel any pan
        isPanning = false;
        lastPinchDist = getPinchDistance();
      } else if (activePointers.size === 1) {
        isPanning = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size >= 2) {
        // Pinch-to-zoom
        const dist = getPinchDistance();
        if (lastPinchDist > 0 && dist > 0) {
          const rect = container.getBoundingClientRect();
          const center = getPinchCenter();
          const sx = center.x - rect.left;
          const sy = center.y - rect.top;

          const c = cameraRef.current;
          const worldX = (sx - c.x) / c.zoom;
          const worldY = (sy - c.y) / c.zoom;

          const scale = dist / lastPinchDist;
          const nextZoom = clamp(c.zoom * scale, MIN_ZOOM, MAX_ZOOM);

          cameraRef.current = {
            x: sx - worldX * nextZoom,
            y: sy - worldY * nextZoom,
            zoom: nextZoom,
          };
        }
        lastPinchDist = dist;
        return;
      }

      if (!isPanning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      cameraRef.current = {
        ...cameraRef.current,
        x: cameraRef.current.x + dx,
        y: cameraRef.current.y + dy,
      };
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) lastPinchDist = 0;
      if (activePointers.size === 0) isPanning = false;
      try { container.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };

    // Fix C12: handle pointercancel to prevent stuck pan state
    const onPointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) lastPinchDist = 0;
      if (activePointers.size === 0) isPanning = false;
      try { container.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const c = cameraRef.current;
      const worldX = (sx - c.x) / c.zoom;
      const worldY = (sy - c.y) / c.zoom;

      const zoomFactor = Math.exp(-e.deltaY * 0.0012);
      const nextZoom = clamp(c.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);

      cameraRef.current = {
        x: sx - worldX * nextZoom,
        y: sy - worldY * nextZoom,
        zoom: nextZoom,
      };
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('wheel', onWheel, { passive: false });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Home') {
        e.preventDefault();
        fitToContent();
      }
      // Cmd+0: fit to content
      if (mod && e.key === '0') {
        e.preventDefault();
        fitToContent();
      }
      // Cmd+= / Cmd++: zoom in
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
      }
      // Cmd+-: zoom out
      if (mod && e.key === '-') {
        e.preventDefault();
        zoomOut();
      }
      // Cmd+Backspace/Delete: clear canvas with confirmation
      if (mod && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        handleClearWithConfirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fitToContent, zoomIn, zoomOut, handleClearWithConfirm]);

  return (
    <section className="relative h-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-paper)] shadow-[var(--shadow-card)]">
      <a
        href="#after-canvas"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-[var(--color-surface)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--color-text-primary)] focus:shadow-lg"
      >
        Skip canvas
      </a>
      <div
        ref={containerRef}
        tabIndex={0}
        className="relative h-full w-full cursor-grab active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
        style={{ touchAction: 'none' }}
        role="img"
        aria-label="Whiteboard drawing canvas"
        aria-describedby="whiteboard-drawing-description"
      >
        <canvas ref={bgRef} className="absolute inset-0" />
        <canvas ref={committedRef} className="absolute inset-0" />
        <canvas ref={activeRef} className="absolute inset-0" />
      </div>

      {/* Drawing-in-progress progress bar */}
      <div
        ref={progressElRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] transition-opacity duration-500 ease-out"
        style={
          {
            '--progress': '0',
            opacity: 0,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        <div
          className="h-full bg-[var(--color-accent,#6366f1)] transition-[width] duration-100 ease-out"
          style={{ width: 'calc(var(--progress, 0) * 100%)' }}
        />
      </div>

      <div id="whiteboard-drawing-description" className="sr-only">
        {drawingDescription}
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {batchAnnouncement}
      </div>

      <span id="after-canvas" />
      {renderError && (
        <div
          role="alert"
          className="absolute inset-x-0 bottom-12 mx-auto w-fit rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800 shadow-md"
        >
          Rendering paused —{' '}
          {retryAttemptsRef.current < MAX_RETRY_ATTEMPTS ? (
            <button
              onClick={retryRendering}
              className="underline font-medium hover:text-red-900 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
              aria-label="Retry rendering"
            >
              click to retry
            </button>
          ) : (
            <span>max retries reached, please reload</span>
          )}
        </div>
      )}

      <div data-testid="whiteboard-stats" className="glass-panel pointer-events-none absolute right-3 top-3 rounded-xl px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-card)]">
        <div data-testid="whiteboard-zoom">Zoom: {(cameraRef.current.zoom * 100).toFixed(0)}%</div>
        <div data-testid="whiteboard-committed" ref={statsCommittedElRef}>Committed: {statsRef.current.committed}</div>
        <div data-testid="whiteboard-active" ref={statsActiveElRef}>Active: {statsRef.current.active}</div>
      </div>

      {/* Floating pill toolbar — bottom-right */}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-2"
        role="toolbar"
        aria-label="Whiteboard toolbar"
      >
        {isMobile ? (
          /* Mobile: collapsed toolbar menu */
          <div className="relative" ref={mobileToolbarRef}>
            <button
              type="button"
              onClick={() => setToolbarOpen((v) => !v)}
              aria-label="Canvas tools"
              aria-expanded={toolbarOpen}
              className="btn-press glass-panel rounded-full px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              ⋯
            </button>
            {toolbarOpen && (
              <div className="absolute bottom-full right-0 mb-1 flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { zoomIn(); }}
                  className="btn-press rounded-lg px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]"
                >
                  + Zoom in
                </button>
                <button
                  type="button"
                  onClick={() => { zoomOut(); }}
                  className="btn-press rounded-lg px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]"
                >
                  − Zoom out
                </button>
                <button
                  type="button"
                  onClick={() => { fitToContent(); setToolbarOpen(false); }}
                  className="btn-press rounded-lg px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]"
                >
                  ⊞ Fit to content
                </button>
                <div className="mx-1 h-px bg-[var(--color-border)]" />
                <button
                  type="button"
                  onClick={() => { handleClearWithConfirm(); setToolbarOpen(false); }}
                  className="btn-press rounded-lg px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
                >
                  🗑 Clear canvas
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Desktop: inline pill toolbar */
          <div className="glass-panel flex items-center gap-px rounded-full px-1 py-1 shadow-[var(--shadow-card)]">
            <button
              type="button"
              onClick={zoomIn}
              aria-label="Zoom in"
              className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              title="Zoom in (⌘+)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
            <span
              ref={statsZoomElRef}
              className="min-w-[3rem] px-1 text-center text-[11px] tabular-nums text-[var(--color-text-secondary)]"
              data-testid="zoom-level"
              aria-live="polite"
              aria-atomic="true"
            >
              {(cameraRef.current.zoom * 100).toFixed(0)}%
            </span>
            <button
              type="button"
              onClick={zoomOut}
              aria-label="Zoom out"
              className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              title="Zoom out (⌘−)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>

            <div className="mx-0.5 h-4 w-px bg-[var(--color-border)]" aria-hidden="true" />

            <button
              type="button"
              onClick={fitToContent}
              aria-label="Fit to content"
              className="btn-press flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              title="Fit to content (⌘0)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              Fit
            </button>

            <div className="mx-0.5 h-4 w-px bg-[var(--color-border)]" aria-hidden="true" />

            <button
              type="button"
              onClick={handleClearWithConfirm}
              aria-label="Clear canvas"
              className="btn-press flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              title="Clear canvas (⌘⌫)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Clear
            </button>
          </div>
        )}

        {/* Export group */}
        <ExportButton whiteboardRef={selfExportRef} disabled={sceneEmpty} />
        <KeyboardShortcutsHelp />
      </div>

      <div data-testid="debug-overlay" className="glass-panel pointer-events-none absolute left-3 top-14 rounded-xl px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-card)]" style={{ display: 'none' }}>
        <div>Committed: 0</div>
        <div>Active: 0</div>
        <div ref={statsFpsElRef}>FPS: 0.0</div>
        <div ref={statsDrawCallsElRef}>Draws: 0</div>
      </div>

      {/* Clear canvas confirmation dialog */}
      {showClearConfirm && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Clear canvas confirmation"
          onClick={cancelClear}
          onKeyDown={(e) => { if (e.key === 'Escape') cancelClear(); }}
        >
          <div
            className="glass-panel mx-4 w-full max-w-xs rounded-2xl border border-[var(--color-border)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold text-[var(--color-text-primary)]">Clear canvas?</h3>
            <p className="mb-4 text-xs text-[var(--color-text-secondary)]">
              This will remove all strokes. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelClear}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClear}
                className="flex-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

export const WhiteboardCanvas = memo(WhiteboardCanvasInner);
