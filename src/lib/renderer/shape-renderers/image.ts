import type { ImageElement } from '@/types/drawing';

// Cache loaded images to avoid reloading on every render
const imageCache = new Map<string, HTMLImageElement>();

export function renderImage(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
): void {
  const cached = imageCache.get(el.src);

  if (cached?.complete) {
    ctx.globalAlpha = el.opacity;
    ctx.drawImage(cached, el.x, el.y, el.w, el.h);
    return;
  }

  // Start loading if not cached
  if (!cached) {
    const img = new Image();
    img.src = el.src;
    imageCache.set(el.src, img);
  }

  // Draw placeholder while loading
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(el.x, el.y, el.w, el.h);
  ctx.setLineDash([]);
}
