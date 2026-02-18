import type { RectElement } from '@/types/drawing';

export function renderRect(
  ctx: CanvasRenderingContext2D,
  el: RectElement,
): void {
  const { x, y, w, h, cornerRadius, fill, stroke } = el;

  ctx.beginPath();
  if (cornerRadius > 0) {
    roundedRectPath(ctx, x, y, w, h, cornerRadius);
  } else {
    ctx.rect(x, y, w, h);
  }

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

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
