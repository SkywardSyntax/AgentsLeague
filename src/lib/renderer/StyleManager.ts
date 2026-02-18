import type { DrawElement } from '@/types/drawing';

/**
 * Parse a CSS color string into an RGBA tuple.
 * Supports #hex (3, 6, 8 digit), rgb(), and rgba().
 */
export function parseColor(
  color: string,
): { r: number; g: number; b: number; a: number } {
  // #rrggbb or #rgb
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }

  // rgba(r, g, b, a) or rgb(r, g, b)
  const match = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1,
    };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

/**
 * Apply element-level base styles to the canvas context.
 * Called before each shape renderer dispatches.
 */
export function applyBaseStyle(
  ctx: CanvasRenderingContext2D,
  el: DrawElement,
): void {
  ctx.globalAlpha = el.opacity;

  // Stroke defaults from elements that have a stroke property
  if ('stroke' in el) {
    const s = el.stroke;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = s.lineCap;
    ctx.lineJoin = s.lineJoin;
  }
}

/**
 * Reset context state that shape renderers may have mutated
 * beyond what ctx.save/restore covers.
 */
export function resetStyle(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Apply vendor-prefixed context properties for compatibility.
 * Currently handles imageSmoothingEnabled.
 */
export function applyVendorPrefixes(
  ctx: CanvasRenderingContext2D,
  options: { imageSmoothingEnabled?: boolean },
): void {
  if (options.imageSmoothingEnabled !== undefined) {
    ctx.imageSmoothingEnabled = options.imageSmoothingEnabled;
    // Legacy webkit prefix
    const ctxAny = ctx as Record<string, unknown>;
    if ('webkitImageSmoothingEnabled' in ctx) {
      ctxAny['webkitImageSmoothingEnabled'] = options.imageSmoothingEnabled;
    }
    if ('mozImageSmoothingEnabled' in ctx) {
      ctxAny['mozImageSmoothingEnabled'] = options.imageSmoothingEnabled;
    }
  }
}
