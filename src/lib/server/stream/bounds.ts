import type { DrawBatch, WhiteboardBounds } from '@/types/agent';

export function boundsOfElementInBatch(el: DrawBatch['elements'][number]): WhiteboardBounds | null {
  if (el.type === 'rect') return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
  if (el.type === 'ellipse')
    return { minX: el.cx - el.rx, minY: el.cy - el.ry, maxX: el.cx + el.rx, maxY: el.cy + el.ry };
  if (el.type === 'line' || el.type === 'arrow') {
    return {
      minX: Math.min(el.from.x, el.to.x),
      minY: Math.min(el.from.y, el.to.y),
      maxX: Math.max(el.from.x, el.to.x),
      maxY: Math.max(el.from.y, el.to.y),
    };
  }
  if (el.type === 'text') {
    const size = el.size ?? 18;
    const width = Math.max(size * 0.45, el.text.length * size * 0.52);
    return { minX: el.x, minY: el.y - size * 0.9, maxX: el.x + width, maxY: el.y + size * 0.5 };
  }
  if (el.type === 'latex') {
    const size = el.fontSize ?? 20;
    const fracCount = (el.tex.match(/\\(?:d?frac|tfrac)\b/g) ?? []).length;
    const rootCount = (el.tex.match(/\\sqrt\b/g) ?? []).length;
    const sumLikeCount = (el.tex.match(/\\(?:sum|prod|int|lim)\b/g) ?? []).length;
    const matrixLikeCount = (el.tex.match(/\\(?:begin\{[^}]*matrix\}|begin\{array\}|cases|aligned|align)\b/g) ?? [])
      .length;
    const scriptCount = (el.tex.match(/[\^_]/g) ?? []).length;
    const lineBreakCount = (el.tex.match(/\\\\/g) ?? []).length;

    const widthScale = 0.44 + Math.min(0.16, fracCount * 0.02 + matrixLikeCount * 0.04);
    const width = Math.min(1460, Math.max(size * 1.8, el.tex.length * size * widthScale));

    const complexity =
      1 +
      fracCount * 0.55 +
      rootCount * 0.2 +
      sumLikeCount * 0.25 +
      matrixLikeCount * 1.2 +
      Math.min(1.2, scriptCount * 0.04) +
      lineBreakCount * 0.6;
    const baseHeight = size * (el.displayMode ? 1.95 : 1.45);
    const height = Math.max(size * (el.displayMode ? 2.15 : 1.5), baseHeight * complexity);

    let minX = el.x;
    if (el.align === 'center') minX = el.x - width / 2;
    if (el.align === 'right') minX = el.x - width;
    return { minX, minY: el.y - size * 1.02, maxX: minX + width, maxY: el.y + height };
  }
  return null;
}

export function boundsOfBatch(batch: DrawBatch): WhiteboardBounds | null {
  let bounds: WhiteboardBounds | null = null;
  for (const el of batch.elements) {
    const b = boundsOfElementInBatch(el);
    if (!b) continue;
    if (!bounds) {
      bounds = { ...b };
      continue;
    }
    bounds = {
      minX: Math.min(bounds.minX, b.minX),
      minY: Math.min(bounds.minY, b.minY),
      maxX: Math.max(bounds.maxX, b.maxX),
      maxY: Math.max(bounds.maxY, b.maxY),
    };
  }
  return bounds;
}
