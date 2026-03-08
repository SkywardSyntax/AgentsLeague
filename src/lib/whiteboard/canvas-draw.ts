import type { Point, LineStyle } from '@/types/agent';
import { catmullRomToBezier, screenStrokePx } from './geometry';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** Apply ctx.setLineDash based on lineStyle, scaled to world coords. */
function applyLineDash(ctx: CanvasRenderingContext2D, lineStyle: LineStyle | undefined, zoom: number, dpr: number): void {
  if (!lineStyle || lineStyle === 'solid') {
    ctx.setLineDash([]);
    return;
  }
  const scale = 1 / (zoom * dpr);
  if (lineStyle === 'dashed') {
    ctx.setLineDash([8 * scale, 4 * scale]);
  } else {
    ctx.setLineDash([2 * scale, 3 * scale]);
  }
}

/**
 * Draw a stroke with per-segment width modulation (sinusoidal ±8%).
 * When `mathematical` is true, uses uniform width for precise rendering.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseWidth: number,
  camera: Camera,
  dpr: number,
  options?: { lineStyle?: LineStyle; mathematical?: boolean },
) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  applyLineDash(ctx, options?.lineStyle, camera.zoom, dpr);

  const uniform = options?.mathematical === true;

  if (uniform) {
    const px = screenStrokePx(baseWidth, camera.zoom, dpr);
    const worldLineWidth = px / (camera.zoom * dpr);
    ctx.lineWidth = worldLineWidth;
    ctx.beginPath();
    const a = points[0]!;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) { ctx.setLineDash([]); return; }
    ctx.moveTo(a.x, a.y);
    for (let i = 1; i < points.length; i++) {
      const b = points[i]!;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  const n = points.length - 1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) ||
        !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
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
  ctx.setLineDash([]);
}

/** Max segments for per-segment width modulation; beyond this use single-path fast-path. */
const SMOOTH_STROKE_MODULATION_LIMIT = 200;

/**
 * Draw a smooth stroke using Catmull-Rom → Bézier conversion.
 * Falls back to drawStroke for fewer than 4 points.
 * When `mathematical` is true, always uses uniform single-path rendering.
 */
export function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseWidth: number,
  camera: Camera,
  dpr: number,
  options?: { lineStyle?: LineStyle; mathematical?: boolean },
) {
  if (points.length < 2) return;
  if (points.length < 4) {
    drawStroke(ctx, points, color, baseWidth, camera, dpr, options);
    return;
  }

  const segs = catmullRomToBezier(points);

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  applyLineDash(ctx, options?.lineStyle, camera.zoom, dpr);

  const uniform = options?.mathematical === true;

  if (uniform || segs.length > SMOOTH_STROKE_MODULATION_LIMIT) {
    // Uniform-width single-path rendering (mathematical or fast-path)
    const px = screenStrokePx(baseWidth, camera.zoom, dpr);
    const worldLineWidth = px / (camera.zoom * dpr);
    ctx.lineWidth = worldLineWidth;

    ctx.beginPath();
    const start = points[0]!;
    if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) { ctx.setLineDash([]); return; }
    ctx.moveTo(start.x, start.y);
    for (const seg of segs) {
      if (!Number.isFinite(seg.cp1.x) || !Number.isFinite(seg.cp1.y) ||
          !Number.isFinite(seg.cp2.x) || !Number.isFinite(seg.cp2.y) ||
          !Number.isFinite(seg.p3.x) || !Number.isFinite(seg.p3.y)) continue;
      ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p3.x, seg.p3.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  // Per-segment width modulation for visual consistency with drawStroke
  const n = segs.length;
  for (let i = 0; i < n; i++) {
    const seg = segs[i]!;
    if (!Number.isFinite(seg.p0.x) || !Number.isFinite(seg.p0.y) ||
        !Number.isFinite(seg.cp1.x) || !Number.isFinite(seg.cp1.y) ||
        !Number.isFinite(seg.cp2.x) || !Number.isFinite(seg.cp2.y) ||
        !Number.isFinite(seg.p3.x) || !Number.isFinite(seg.p3.y)) continue;

    const t = n > 1 ? i / (n - 1) : 0;
    const widthMod = 1 + 0.08 * Math.sin(t * Math.PI);
    const px = screenStrokePx(baseWidth * widthMod, camera.zoom, dpr);
    const worldLineWidth = px / (camera.zoom * dpr);

    ctx.lineWidth = worldLineWidth;
    ctx.beginPath();
    ctx.moveTo(seg.p0.x, seg.p0.y);
    ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p3.x, seg.p3.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
