'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawBatch, StrokeTrajectory, Point } from '@/types/agent';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { lowerMathPrimitive } from '@/lib/whiteboard/planner/lowerer';
import {
  drawStroke as drawLinearStroke,
  drawSmoothStroke,
  drawTextFallback,
} from '@/lib/whiteboard/canvas-draw';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiniPreviewCanvasProps {
  drawBatch: DrawBatch | null;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 200;
const GRID_SIZE = 20;
const PADDING = 16;

const GRID_COLOR = 'rgba(0,0,0,0.04)';
const BACKGROUND_COLOR = '#fafafa';
const COLLINEARITY_EPSILON = 1e-4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCollinear(points: Point[]): boolean {
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

/** Count math-primitive elements before lowering. */
const MATH_PRIMITIVE_TYPES = new Set([
  'cartesian_axes', 'number_line', 'vector_arrow',
  'function_curve', 'angle_arc', 'integral_region',
]);

function countLoweredElements(batch: DrawBatch): number {
  let count = 0;
  for (const el of batch.elements) {
    if (MATH_PRIMITIVE_TYPES.has(el.type)) {
      count += lowerMathPrimitive(el as Parameters<typeof lowerMathPrimitive>[0]).length;
    } else {
      count += 1;
    }
  }
  return count;
}

/** Compute bounding box from strokes. */
function computeStrokesBounds(strokes: StrokeTrajectory[]): {
  minX: number; minY: number; maxX: number; maxY: number;
} | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      hasPoints = true;
    }
    // Include text fallback positions in bounds
    if (stroke.textFallback) {
      const tf = stroke.textFallback;
      const x = tf.x;
      const y = tf.y;
      const w = tf.fontSize * tf.text.length * 0.6;
      const h = tf.fontSize;
      if (x < minX) minX = x;
      if (x + w > maxX) maxX = x + w;
      if (y < minY) minY = y;
      if (y + h > maxY) maxY = y + h;
      hasPoints = true;
    }
  }
  if (!hasPoints) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Compute a camera that fits the given bounding box within the canvas.
 * Returns { x, y, zoom } where (x, y) is the camera offset in world coords.
 */
function computeFitCamera(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  canvasW: number,
  canvasH: number,
  padding: number,
): { x: number; y: number; zoom: number } {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const availW = canvasW - padding * 2;
  const availH = canvasH - padding * 2;

  // Prevent division by zero for single-point drawings
  const effectiveBw = Math.max(bw, 1);
  const effectiveBh = Math.max(bh, 1);

  const zoom = Math.min(availW / effectiveBw, availH / effectiveBh, 3);

  // Center the drawing
  const cx = bounds.minX + bw / 2;
  const cy = bounds.minY + bh / 2;
  const x = cx - canvasW / (2 * zoom);
  const y = cy - canvasH / (2 * zoom);

  return { x, y, zoom };
}

/** Draw grid lines on the canvas. */
function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number): void {
  ctx.save();
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1 / dpr;
  const step = GRID_SIZE;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MiniPreviewCanvas = memo(function MiniPreviewCanvas({
  drawBatch,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: MiniPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<StrokeTrajectory[] | null>(null);
  const [compileError, setCompileError] = useState(false);
  const compilationIdRef = useRef(0);

  // Count stats (memoized from the raw batch, before async compilation)
  const stats = useMemo(() => {
    if (!drawBatch) return null;
    const elementCount = drawBatch.elements.length;
    const loweredCount = countLoweredElements(drawBatch);
    return { elementCount, loweredCount };
  }, [drawBatch]);

  // Compile batch to strokes (async, cancellable)
  useEffect(() => {
    if (!drawBatch) {
      setStrokes(null);
      setCompileError(false);
      return;
    }

    const id = ++compilationIdRef.current;
    let cancelled = false;

    compileBatchToStrokes(drawBatch)
      .then((result) => {
        if (cancelled || compilationIdRef.current !== id) return;
        setStrokes(result.strokes);
        setCompileError(false);
      })
      .catch(() => {
        if (cancelled || compilationIdRef.current !== id) return;
        setCompileError(true);
        setStrokes(null);
      });

    return () => { cancelled = true; };
  }, [drawBatch]);

  // Render strokes to canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !strokes || strokes.length === 0) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);

    // Grid
    drawGrid(ctx, width, height, dpr);

    // Compute fit camera
    const bounds = computeStrokesBounds(strokes);
    if (!bounds) return;

    const camera = computeFitCamera(bounds, width, height, PADDING);

    // Apply camera transform
    ctx.save();
    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw all strokes immediately
    for (const stroke of strokes) {
      if (stroke.textFallback) {
        const tf = stroke.textFallback;
        drawTextFallback(ctx, tf.text, tf.x, tf.y, tf.fontSize, stroke.color, camera, dpr);
        continue;
      }
      if (stroke.points.length < 2) continue;
      if (stroke.points.length <= 2 || isCollinear(stroke.points)) {
        drawLinearStroke(ctx, stroke.points, stroke.color, stroke.baseWidth, camera, dpr, {
          lineStyle: stroke.lineStyle,
          mathematical: stroke.mathematical,
        });
      } else {
        drawSmoothStroke(ctx, stroke.points, stroke.color, stroke.baseWidth, camera, dpr, {
          lineStyle: stroke.lineStyle,
          mathematical: stroke.mathematical,
        });
      }
    }

    ctx.restore();
  }, [strokes, width, height]);

  // Trigger render via requestAnimationFrame
  useEffect(() => {
    if (!strokes) {
      // Clear canvas when no strokes
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          ctx.fillStyle = BACKGROUND_COLOR;
          ctx.fillRect(0, 0, width, height);
          drawGrid(ctx, width, height, dpr);
        }
      }
      return;
    }
    const rafId = requestAnimationFrame(renderCanvas);
    return () => cancelAnimationFrame(rafId);
  }, [strokes, renderCanvas, width, height]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header */}
      <p className="text-[11px] font-semibold tracking-wide text-[var(--color-text-secondary)] uppercase">
        Preview
      </p>

      {/* Canvas container */}
      <div
        className="relative overflow-hidden rounded-lg border border-[var(--color-border)]"
        style={{ width, height }}
      >
        <canvas
          ref={canvasRef}
          style={{ width, height, display: 'block' }}
        />

        {/* Element count badge */}
        {stats && strokes && !compileError && (
          <div className="absolute bottom-1.5 right-1.5 flex flex-col items-end gap-0.5">
            <span className="rounded-md bg-[var(--color-surface)]/90 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-text-secondary)] shadow-sm backdrop-blur-sm">
              {stats.elementCount} element{stats.elementCount !== 1 ? 's' : ''}
            </span>
            {stats.loweredCount !== stats.elementCount && (
              <span className="rounded-md bg-[var(--color-surface)]/90 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-accent)] shadow-sm backdrop-blur-sm">
                Lowered: {stats.loweredCount}
              </span>
            )}
          </div>
        )}

        {/* Error / empty state overlay */}
        {compileError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/60 backdrop-blur-[2px]">
            <span className="text-[11px] text-[var(--color-text-muted)]">Render error</span>
          </div>
        )}
      </div>
    </div>
  );
});
