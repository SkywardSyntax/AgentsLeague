import type { LineElement } from '@/types/drawing';

export function renderLine(
  ctx: CanvasRenderingContext2D,
  el: LineElement,
): void {
  const { points, stroke } = el;
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(el.x + points[0].x, el.y + points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(el.x + points[i].x, el.y + points[i].y);
  }

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.lineCap;
  ctx.lineJoin = stroke.lineJoin;
  if (stroke.dashArray) ctx.setLineDash(stroke.dashArray);
  ctx.stroke();
  if (stroke.dashArray) ctx.setLineDash([]);
}
