'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ActiveStroke, DrawBatch, StrokeTrajectory } from '@/types/agent';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { createActiveBatch, easeOutCubic } from '@/lib/whiteboard/stroke-scheduler';
import { normalizeBatchTextSpacingAgainstScene } from '@/lib/whiteboard/layout-spacing';
import {
  partialPolylineByLength,
  screenStrokePx,
} from '@/lib/whiteboard/geometry';

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

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

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

export function WhiteboardCanvas({ batches, onWarning }: WhiteboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const committedRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<HTMLCanvasElement>(null);

  const committedStrokesRef = useRef<StrokeTrajectory[]>([]);
  const activeStrokesRef = useRef<ActiveStroke[]>([]);

  const processedBatchIdsRef = useRef<Set<string>>(new Set());
  const clearGenerationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const committedDirtyRef = useRef(true);
  const drawErrorCountRef = useRef(0);

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

  const resizeCanvases = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const nextDpr = window.devicePixelRatio || 1;

    dprRef.current = nextDpr;
    sizeRef.current = { width: rect.width, height: rect.height };

    [bgRef.current, committedRef.current, activeRef.current].forEach((canvas) => {
      if (!canvas) return;
      canvas.width = Math.floor(rect.width * nextDpr);
      canvas.height = Math.floor(rect.height * nextDpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    });
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => resizeCanvases());
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedResize = () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => resizeCanvases(), 100);
    };
    window.addEventListener('resize', debouncedResize);
    return () => {
      cancelAnimationFrame(raf);
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedResize);
    };
  }, [resizeCanvases]);

  useEffect(() => {
    let cancelled = false;

    const process = async () => {
      for (const batch of batches) {
        if (processedBatchIdsRef.current.has(batch.batch_id)) continue;
        processedBatchIdsRef.current.add(batch.batch_id);

        const compiled = await compileBatchToStrokes(batch);
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
          const active = createActiveBatch(compiled.strokes, performance.now());
          activeStrokesRef.current.push(...active);
        }
      }
    };

    void process();

    return () => {
      cancelled = true;
    };
  }, [batches]);

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
        bgCtx.fillStyle = '#f7f9fc';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        bgCtx.setTransform(scale, 0, 0, scale, tx, ty);
        bgCtx.strokeStyle = 'rgba(77, 93, 118, 0.16)';
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
        }
        committedDirtyRef.current = false;
      }

      activeCtx.setTransform(1, 0, 0, 1, 0, 0);
      activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
      activeCtx.setTransform(scale, 0, 0, scale, tx, ty);

      const now = performance.now();
      const nextActive: ActiveStroke[] = [];
      const completed: StrokeTrajectory[] = [];

      for (const stroke of activeStrokesRef.current) {
        const t = easeOutCubic((now - stroke.startedAt) / stroke.durationMs);
        const visibleLength = stroke.length * t;
        const partial = partialPolylineByLength(stroke.points, stroke.cumulativeLengths, visibleLength);

        if (stroke.bounds) {
          const b = stroke.bounds;
          if (b.maxX < vpMinX - cullMargin || b.minX > vpMaxX + cullMargin ||
              b.maxY < vpMinY - cullMargin || b.minY > vpMaxY + cullMargin) {
            if (t >= 1) { completed.push(stroke); } else { nextActive.push(stroke); }
            continue;
          }
        }

        drawStroke(activeCtx, partial, stroke.color, stroke.baseWidth, camera, dpr);

        if (t >= 1) {
          completed.push(stroke);
        } else {
          nextActive.push(stroke);
        }
      }

      // Fix N5: discard completed strokes if a clear happened mid-frame (zombie stroke fix)
      const currentGen = clearGenerationRef.current;
      if (completed.length > 0 && currentGen === lastClearGeneration) {
        committedStrokesRef.current = committedStrokesRef.current.concat(completed);
        committedDirtyRef.current = true;
      }
      lastClearGeneration = currentGen;
      activeStrokesRef.current = nextActive;

      // Fix C2: update stats via direct DOM mutation instead of setState
      const nextActive_count = nextActive.length;
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

      drawErrorCountRef.current = 0;
      } catch (err) {
        drawErrorCountRef.current += 1;
        console.error('WhiteboardCanvas draw error:', err);
        if (drawErrorCountRef.current >= 10) {
          return;
        }
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isPanning = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isPanning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
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
      isPanning = false;
      container.releasePointerCapture(e.pointerId);
    };

    // Fix C12: handle pointercancel to prevent stuck pan state
    const onPointerCancel = (e: PointerEvent) => {
      isPanning = false;
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

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <section className="relative h-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-paper)] shadow-[var(--shadow-card)]">
      <div
        ref={containerRef}
        className="relative h-full w-full cursor-grab active:cursor-grabbing"
        aria-label="Whiteboard"
        role="application"
      >
        <canvas ref={bgRef} className="absolute inset-0" />
        <canvas ref={committedRef} className="absolute inset-0" />
        <canvas ref={activeRef} className="absolute inset-0" />
      </div>

      <div className="glass-panel pointer-events-none absolute left-3 top-3 rounded-xl px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-card)]">
        <div ref={statsZoomElRef}>Zoom: {(cameraRef.current.zoom * 100).toFixed(0)}%</div>
        <div ref={statsCommittedElRef}>Committed: {statsRef.current.committed}</div>
        <div ref={statsActiveElRef}>Active: {statsRef.current.active}</div>
      </div>
    </section>
  );
}
