import type { ArrowElement } from '@/types/drawing';

const ARROWHEAD_SIZE = 10;

export function renderArrow(
  ctx: CanvasRenderingContext2D,
  el: ArrowElement,
): void {
  const { points, stroke } = el;
  if (points.length < 2) return;

  // Draw shaft
  ctx.beginPath();
  ctx.moveTo(el.x + points[0].x, el.y + points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(el.x + points[i].x, el.y + points[i].y);
  }
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.lineCap;
  ctx.lineJoin = stroke.lineJoin;
  ctx.stroke();

  // End arrowhead
  if (el.endArrowhead !== 'none' && points.length >= 2) {
    const from = points[points.length - 2];
    const to = points[points.length - 1];
    drawArrowhead(
      ctx,
      el.x + from.x,
      el.y + from.y,
      el.x + to.x,
      el.y + to.y,
      el.endArrowhead,
      stroke.color,
      stroke.width,
    );
  }

  // Start arrowhead
  if (el.startArrowhead !== 'none' && points.length >= 2) {
    drawArrowhead(
      ctx,
      el.x + points[1].x,
      el.y + points[1].y,
      el.x + points[0].x,
      el.y + points[0].y,
      el.startArrowhead,
      stroke.color,
      stroke.width,
    );
  }
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  type: 'arrow' | 'dot',
  color: string,
  lineWidth: number,
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.save();
  ctx.translate(toX, toY);
  ctx.rotate(angle);

  if (type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-ARROWHEAD_SIZE, -ARROWHEAD_SIZE / 2);
    ctx.lineTo(-ARROWHEAD_SIZE, ARROWHEAD_SIZE / 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  } else if (type === 'dot') {
    ctx.beginPath();
    ctx.arc(0, 0, lineWidth * 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.restore();
}
