import type { EllipseElement } from '@/types/drawing';

export function renderEllipse(
  ctx: CanvasRenderingContext2D,
  el: EllipseElement,
): void {
  const { x, y, rx, ry, fill, stroke } = el;

  ctx.beginPath();
  ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2);

  if (fill.type === 'solid') {
    ctx.fillStyle = fill.color;
    ctx.globalAlpha = el.opacity * fill.opacity;
    ctx.fill();
    ctx.globalAlpha = el.opacity;
  }

  if (stroke.width > 0) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = stroke.lineCap;
    ctx.lineJoin = stroke.lineJoin;
    if (stroke.dashArray) ctx.setLineDash(stroke.dashArray);
    ctx.stroke();
    if (stroke.dashArray) ctx.setLineDash([]);
  }
}
