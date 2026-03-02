'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveStroke, DrawBatch, StrokeTrajectory } from '@/types/agent';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { createActiveBatch, easeOutCubic, prefersReducedMotion, weightedVisibleLength } from '@/lib/whiteboard/stroke-scheduler';
import { normalizeBatchTextSpacingAgainstScene } from '@/lib/whiteboard/layout-spacing';
import {
  partialPolylineByLength,
  screenStrokePx,
  computeFitCamera,
} from '@/lib/whiteboard/geometry';
import { computeFps, isDebugShortcut, createDrawCallCounter, formatFps } from '@/lib/whiteboard/canvas-debug';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface WhiteboardCanvasProps {
  batches: DrawBatch[];
  onWarning: (warning: string) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const MAX_COMMITTED = 2000;

import { clamp } from '@/lib/whiteboard/geometry';

function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokeTrajectory['points'],
  color: string,
  baseWidth: number,
  camera: Camera,
  dpr: number,
) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const n = points.length - 1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const t = i / n;

    const widthMod = 1 + 0.08 * Math.sin(t * Math.PI);
    const worldWidth = baseWidth * widthMod;
    const px = screenStrokePx(worldWidth, camera.zoom, dpr);
    const worldLineWidth = px / (camera.zoom * dpr);

    ctx.lineWidth = worldLineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

const MAX_RETRY_ATTEMPTS = 3;

export function WhiteboardCanvas({ batches, onWarning }: WhiteboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const committedRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<HTMLCanvasElement>(null);

  const committedStrokesRef = useRef<StrokeTrajectory[]>([]);
  const activeStrokesRef = useRef<ActiveStroke[]>([]);
  const committedDirtyRef = useRef(true);

  const gridColorsRef = useRef({ bg: '#f7f9fc', stroke: 'rgba(77, 93, 118, 0.16)' });

  const readGridColors = useCallback(() => {
    const style = getComputedStyle(document.documentElement);
    gridColorsRef.current = {
      bg: style.getPropertyValue('--color-grid-bg').trim() || '#f7f9fc',
      stroke: style.getPropertyValue('--color-grid').trim() || 'rgba(77, 93, 118, 0.16)',
    };
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
  const MAX_PROCESSED_BATCH_IDS = 500;
  const clearGenerationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const drawErrorCountRef = useRef(0);
  const retryAttemptsRef = useRef(0);

  const [renderError, setRenderError] = useState(false);

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
  const statsZoomElRef = useRef<HTMLDivElement>(null);
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

    return () => {
      cancelAnimationFrame(raf);
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [resizeCanvases]);

  useEffect(() => {
    let cancelled = false;

    const process = async () => {
      for (const batch of batches) {
        if (cancelled) return;
        if (processedBatchIdsRef.current.has(batch.batch_id)) continue;
        processedBatchIdsRef.current.add(batch.batch_id);

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
          } else {
            const active = createActiveBatch(compiled.strokes, performance.now());
            activeStrokesRef.current.push(...active);
          }
        }
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
        prevSize.width !== size.width || prevSize.height !== size.height;

      if (cameraChanged) {
        prevCameraRef.current = { ...camera };
        prevSizeRef.current = { ...size };
        committedDirtyRef.current = true;

        bgCtx.setTransform(1, 0, 0, 1, 0, 0);
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.fillStyle = gridColorsRef.current.bg;
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        bgCtx.setTransform(scale, 0, 0, scale, tx, ty);
        bgCtx.strokeStyle = gridColorsRef.current.stroke;
        bgCtx.lineWidth = 1 / scale;

        const grid = 30;
        const minX = -camera.x / camera.zoom - grid;
        const minY = -camera.y / camera.zoom - grid;
        const maxX = minX + size.width / camera.zoom + grid * 2;
        const maxY = minY + size.height / camera.zoom + grid * 2;

        for (let x = Math.floor(minX / grid) * grid; x <= maxX; x += grid) {
          bgCtx.beginPath();
          bgCtx.moveTo(x, minY);
          bgCtx.lineTo(x, maxY);
          bgCtx.stroke();
        }

        for (let y = Math.floor(minY / grid) * grid; y <= maxY; y += grid) {
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
          drawStroke(committedCtx, stroke.points, stroke.color, stroke.baseWidth, camera, dpr);
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

        drawStroke(activeCtx, partial, stroke.color, stroke.baseWidth, camera, dpr);
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
      }
      lastClearGeneration = currentGen;
      activeStrokesRef.current = nextActive;
      } // end active strokes else-branch

      // Fix C2: update stats via direct DOM mutation instead of setState
      const nextActive_count = activeStrokesRef.current.length;
      const nextCommitted_count = committedStrokesRef.current.length;
      if (statsRef.current.active !== nextActive_count || statsRef.current.committed !== nextCommitted_count) {
        statsRef.current = { active: nextActive_count, committed: nextCommitted_count };
        if (statsCommittedElRef.current) statsCommittedElRef.current.textContent = `Committed: ${nextCommitted_count}`;
        if (statsActiveElRef.current) statsActiveElRef.current.textContent = `Active: ${nextActive_count}`;
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
      if (e.key === 'Home') {
        e.preventDefault();
        fitToContent();
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
  }, [fitToContent]);

  return (
    <section className="relative h-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-paper)] shadow-[var(--shadow-card)]">
      <div
        ref={containerRef}
        tabIndex={0}
        className="relative h-full w-full cursor-grab active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
        style={{ touchAction: 'none' }}
        aria-label="Whiteboard"
        role="application"
      >
        <canvas ref={bgRef} className="absolute inset-0" />
        <canvas ref={committedRef} className="absolute inset-0" />
        <canvas ref={activeRef} className="absolute inset-0" />
      </div>

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

      <div className="absolute left-3 top-3 flex items-center gap-1">
        <button
          type="button"
          onClick={resetCamera}
          aria-label="Reset view"
          className="btn-press glass-panel rounded-lg px-2 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          title="Reset view (Ctrl+0)"
        >
          ⌂
        </button>
        <button
          type="button"
          onClick={zoomOut}
          aria-label="Zoom out"
          className="btn-press glass-panel rounded-lg px-2 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          title="Zoom out"
        >
          −
        </button>
        <span
          ref={statsZoomElRef}
          className="glass-panel rounded-lg px-2 py-1.5 text-xs tabular-nums text-[var(--color-text-secondary)] shadow-[var(--shadow-card)]"
          data-testid="zoom-level"
          aria-live="polite"
          aria-atomic="true"
        >
          {(cameraRef.current.zoom * 100).toFixed(0)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          aria-label="Zoom in"
          className="btn-press glass-panel rounded-lg px-2 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div data-testid="debug-overlay" className="glass-panel pointer-events-none absolute left-3 top-14 rounded-xl px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-card)]" style={{ display: 'none' }}>
        <div ref={statsCommittedElRef}>Committed: {statsRef.current.committed}</div>
        <div ref={statsActiveElRef}>Active: {statsRef.current.active}</div>
        <div ref={statsFpsElRef}>FPS: 0.0</div>
        <div ref={statsDrawCallsElRef}>Draws: 0</div>
      </div>

      <button
        onClick={fitToContent}
        className="glass-panel absolute bottom-3 right-3 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] shadow-[var(--shadow-card)] hover:text-[var(--color-text-primary)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
        aria-label="Fit to content"
        title="Fit to content (Home)"
      >
        ⊞ Fit
      </button>
    </section>
  );
}
