import type { FreehandElement } from '@/types/drawing';

export function renderFreehand(
  ctx: CanvasRenderingContext2D,
  el: FreehandElement,
): void {
  const { points, stroke } = el;
  if (points.length < 2) return;

  const p0 = points[0]!;
  ctx.beginPath();
  ctx.moveTo(el.x + p0.x, el.y + p0.y);

  // Smooth polyline using quadratic curves through midpoints
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i]!;
    const next = points[i + 1]!;
    const midX = (el.x + curr.x + el.x + next.x) / 2;
    const midY = (el.y + curr.y + el.y + next.y) / 2;
    ctx.quadraticCurveTo(el.x + curr.x, el.y + curr.y, midX, midY);
  }

  // Final segment to last point
  const last = points[points.length - 1]!;
  ctx.lineTo(el.x + last.x, el.y + last.y);

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.lineCap;
  ctx.lineJoin = stroke.lineJoin;
  if (stroke.dashArray) ctx.setLineDash(stroke.dashArray);
  ctx.stroke();
  if (stroke.dashArray) ctx.setLineDash([]);
}
