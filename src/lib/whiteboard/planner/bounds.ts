import type { DrawElement, WhiteboardBounds } from '@/types/agent';

function allFinite(...ns: number[]): boolean {
  return ns.every((n) => Number.isFinite(n));
}

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * Unified bounds estimation for all DrawElement types.
 * Single source of truth used by constraints, context-v2, and templates.
 * Returns null for elements with invalid geometry (NaN, Infinity, negative dims).
 */
export function boundsOf(el: DrawElement): WhiteboardBounds | null {
  if (el.type === 'rect') {
    if (!allFinite(el.x, el.y, el.w, el.h) || !isFinitePositive(el.w) || !isFinitePositive(el.h)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
  }
  if (el.type === 'ellipse') {
    if (!allFinite(el.cx, el.cy, el.rx, el.ry) || !isFinitePositive(el.rx) || !isFinitePositive(el.ry)) return null;
    return { minX: el.cx - el.rx, minY: el.cy - el.ry, maxX: el.cx + el.rx, maxY: el.cy + el.ry };
  }
  if (el.type === 'line' || el.type === 'arrow') {
    if (!allFinite(el.from.x, el.from.y, el.to.x, el.to.y)) return null;
    return {
      minX: Math.min(el.from.x, el.to.x),
      minY: Math.min(el.from.y, el.to.y),
      maxX: Math.max(el.from.x, el.to.x),
      maxY: Math.max(el.from.y, el.to.y),
    };
  }
  if (el.type === 'text') {
    if (!allFinite(el.x, el.y)) return null;
    const size = el.size ?? 18;
    if (!isFinitePositive(size)) return null;
    const width = Math.max(size * 0.45, el.text.length * size * 0.52);
    return { minX: el.x, minY: el.y - size * 0.9, maxX: el.x + width, maxY: el.y + size * 0.5 };
  }
  if (el.type === 'latex') {
    if (!allFinite(el.x, el.y)) return null;
    if (!el.tex) return null;
    const size = el.fontSize ?? 20;
    if (!isFinitePositive(size)) return null;
    const fracCount = (el.tex.match(/\\(?:d?frac|tfrac)\b/g) ?? []).length;
    const rootCount = (el.tex.match(/\\sqrt\b/g) ?? []).length;
    const sumLikeCount = (el.tex.match(/\\(?:sum|prod|int|lim)\b/g) ?? []).length;
    const matrixLikeCount = (el.tex.match(/\\begin\{(?:[^}]*matrix|array|cases|aligned|align)\}/g) ?? [])
      .length;
    const scriptCount = (el.tex.match(/[\^_]/g) ?? []).length;
    const lineBreakCount = (el.tex.match(/\\\\/g) ?? []).length;

    const widthScale = 0.44 + Math.min(0.16, fracCount * 0.02 + matrixLikeCount * 0.04);
    const rawWidth = Math.max(size * 1.8, el.tex.length * size * widthScale);
    const width = Math.min(1460, rawWidth);

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
