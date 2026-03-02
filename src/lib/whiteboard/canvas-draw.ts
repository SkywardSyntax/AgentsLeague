import type { Point } from '@/types/agent';
import { catmullRomToBezier, screenStrokePx } from './geometry';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Draw a stroke with per-segment width modulation (sinusoidal ±8%).
 * Accepts pre-computed screenWidth to avoid recalculating screenStrokePx per segment.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
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
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) ||
        !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
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

/**
 * Draw a smooth stroke using Catmull-Rom → Bézier conversion.
 * Falls back to drawStroke for fewer than 4 points.
 */
export function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
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
  const start = points[0]!;
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) return;
  ctx.moveTo(start.x, start.y);
  for (const seg of segs) {
    if (!Number.isFinite(seg.cp1.x) || !Number.isFinite(seg.cp1.y) ||
        !Number.isFinite(seg.cp2.x) || !Number.isFinite(seg.cp2.y) ||
        !Number.isFinite(seg.p3.x) || !Number.isFinite(seg.p3.y)) continue;
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p3.x, seg.p3.y);
  }
  ctx.stroke();
}
