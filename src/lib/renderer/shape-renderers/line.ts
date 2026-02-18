import type { LineElement } from '@/types/drawing';

export function renderLine(
  ctx: CanvasRenderingContext2D,
  el: LineElement,
): void {
  const { points, stroke } = el;
  if (points.length < 2) return;

  const p0 = points[0]!;
  ctx.beginPath();
  ctx.moveTo(el.x + p0.x, el.y + p0.y);

  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    ctx.lineTo(el.x + p.x, el.y + p.y);
  }

  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.lineCap;
  ctx.lineJoin = stroke.lineJoin;
  if (stroke.dashArray) ctx.setLineDash(stroke.dashArray);
  ctx.stroke();
  if (stroke.dashArray) ctx.setLineDash([]);
}
