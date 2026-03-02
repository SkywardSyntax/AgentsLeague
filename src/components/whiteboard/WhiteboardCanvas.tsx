'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveStroke, DrawBatch, StrokeTrajectory } from '@/types/agent';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { createActiveBatch, easeOutCubic, weightedVisibleLength } from '@/lib/whiteboard/stroke-scheduler';
import { normalizeBatchTextSpacingAgainstScene } from '@/lib/whiteboard/layout-spacing';
import {
  catmullRomToBezier,
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

import { clamp } from '@/lib/whiteboard/geometry';

function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokeTrajectory['points'],
  color: string,
  baseWidth: number,
  camera: Camera,
  dpr: number,
) {
  if (points.length < 2) return;
  if (points.length < 4) {
    drawStroke(ctx, points, color, baseWidth, camera, dpr);
    return;
  }

  const segs = catmullRomToBezier(points);
  const px = screenStrokePx(baseWidth, camera.zoom, dpr);
  const worldLineWidth = px / (camera.zoom * dpr);

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = worldLineWidth;

  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (const seg of segs) {
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p3.x, seg.p3.y);
  }
  ctx.stroke();
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

    const widthMod = 1 + 0.08 * Math.sin(t * Math.PI * 2);
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
  const rafRef = useRef<number | null>(null);
  const [dpr, setDpr] = useState(1);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [camera, setCamera] = useState<Camera>({ x: 40, y: 40, zoom: 1 });
  const [stats, setStats] = useState({ active: 0, committed: 0 });

  const resizeCanvases = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const nextDpr = window.devicePixelRatio || 1;

    setDpr(nextDpr);
    setSize({ width: rect.width, height: rect.height });

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
    window.addEventListener('resize', resizeCanvases);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resizeCanvases);
    };
  }, [resizeCanvases]);

  useEffect(() => {
    let cancelled = false;

    const process = async () => {
      for (const batch of batches) {
        if (cancelled) return;
        if (processedBatchIdsRef.current.has(batch.batch_id)) continue;
        processedBatchIdsRef.current.add(batch.batch_id);

        const compiled = await compileBatchToStrokes(batch);
        if (cancelled) return;

        if (compiled.clear) {
          committedStrokesRef.current = [];
          activeStrokesRef.current = [];
        }

        compiled.warnings.forEach(onWarning);

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
  }, [batches, onWarning]);

  useEffect(() => {
    const drawFrame = () => {
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

      const scale = dpr * camera.zoom;
      const tx = camera.x * dpr;
      const ty = camera.y * dpr;

      const drawGrid = () => {
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
      };

      drawGrid();

      committedCtx.setTransform(1, 0, 0, 1, 0, 0);
      committedCtx.clearRect(0, 0, committedCanvas.width, committedCanvas.height);
      committedCtx.setTransform(scale, 0, 0, scale, tx, ty);

      activeCtx.setTransform(1, 0, 0, 1, 0, 0);
      activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
      activeCtx.setTransform(scale, 0, 0, scale, tx, ty);

      for (const stroke of committedStrokesRef.current) {
        drawSmoothStroke(committedCtx, stroke.points, stroke.color, stroke.baseWidth, camera, dpr);
      }

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

        drawStroke(activeCtx, partial, stroke.color, stroke.baseWidth, camera, dpr);

        if (rawT >= 1) {
          completed.push(stroke);
        } else {
          nextActive.push(stroke);
        }
      }

      if (completed.length > 0) {
        committedStrokesRef.current = committedStrokesRef.current.concat(completed);
      }
      activeStrokesRef.current = nextActive;

      const nextStats = {
        active: activeStrokesRef.current.length,
        committed: committedStrokesRef.current.length,
      };
      setStats((prev) =>
        prev.active === nextStats.active && prev.committed === nextStats.committed
          ? prev
          : nextStats,
      );

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [camera, dpr, size.height, size.width]);

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
      setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
    };

    const onPointerUp = (e: PointerEvent) => {
      isPanning = false;
      container.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      setCamera((c) => {
        const worldX = (sx - c.x) / c.zoom;
        const worldY = (sy - c.y) / c.zoom;

        const zoomFactor = Math.exp(-e.deltaY * 0.0012);
        const nextZoom = clamp(c.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);

        return {
          x: sx - worldX * nextZoom,
          y: sy - worldY * nextZoom,
          zoom: nextZoom,
        };
      });
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
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
        <div>Zoom: {(camera.zoom * 100).toFixed(0)}%</div>
        <div>Committed: {stats.committed}</div>
        <div>Active: {stats.active}</div>
      </div>
    </section>
  );
}
