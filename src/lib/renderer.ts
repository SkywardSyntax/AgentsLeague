import type { BoundingBox, Camera, DrawElement } from '@/types';

/** Renders a single DrawElement onto the given canvas context. */
export function renderElement(
  ctx: CanvasRenderingContext2D,
  element: DrawElement,
  _camera: Camera,
): void {
  ctx.save();
  ctx.globalAlpha = element.opacity;
  ctx.translate(element.x, element.y);
  ctx.rotate((element.rotation * Math.PI) / 180);

  switch (element.type) {
    case 'rect':
      // Stub — full implementation in P0
      break;
    case 'ellipse':
      break;
    case 'line':
    case 'arrow':
    case 'freehand':
      break;
    case 'text':
      break;
    case 'image':
      break;
  }

  ctx.restore();
}

/** Draw ghost placeholder bounding box during AI streaming. */
export function drawGhostRect(
  ctx: CanvasRenderingContext2D,
  rect: BoundingBox,
): void {
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(0, 122, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);
}
