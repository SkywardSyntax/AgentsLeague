import type { DrawElement, WhiteboardBounds } from '@/types/agent';

export type BoundsMode = 'fast' | 'detailed';

interface BoundsOptions {
  mode?: BoundsMode;
}

function allFinite(...ns: number[]): boolean {
  return ns.every((n) => Number.isFinite(n));
}

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * Canonical element-bounds computation — single source of truth.
 *
 * - `fast`     : simpler formulas for animation-frame rendering (client-side).
 * - `detailed` : accurate formulas with 0.52 char-width multiplier, baseline
 *                offset, multiline support, and LaTeX regex heuristics for
 *                placement planning (server-side).
 *
 * Returns null for `clear` elements or when geometry contains NaN / Infinity /
 * non-positive dimensions.
 */
export function computeElementBounds(
  el: DrawElement,
  opts: BoundsOptions = {},
): WhiteboardBounds | null {
  const mode = opts.mode ?? 'fast';

  if (el.type === 'clear') return null;

  if (el.type === 'rect') {
    if (!allFinite(el.x, el.y, el.w, el.h) || !isFinitePositive(el.w) || !isFinitePositive(el.h)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
  }

  if (el.type === 'ellipse') {
    if (!allFinite(el.cx, el.cy, el.rx, el.ry) || !isFinitePositive(el.rx) || !isFinitePositive(el.ry)) return null;
    return {
      minX: el.cx - el.rx,
      minY: el.cy - el.ry,
      maxX: el.cx + el.rx,
      maxY: el.cy + el.ry,
    };
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
    const lines = el.text.split('\n');
    const maxLineLen = Math.max(...lines.map((l: string) => l.length));

    if (mode === 'detailed') {
      const TEXT_WIDTH_CAP = 1200;
      const width = Math.min(Math.max(size * 0.45, maxLineLen * size * 0.52), TEXT_WIDTH_CAP);
      const height = lines.length * size * 1.3;
      return { minX: el.x, minY: el.y - size * 0.9, maxX: el.x + width, maxY: el.y - size * 0.9 + height };
    }

    // fast mode
    const width = Math.max(size, maxLineLen * size * 0.5);
    const height = lines.length * size * 1.3;
    return { minX: el.x, minY: el.y, maxX: el.x + width, maxY: el.y + height };
  }

  if (el.type === 'latex') {
    if (!allFinite(el.x, el.y)) return null;
    if (!el.tex) return null;
    const size = el.fontSize ?? 20;
    if (!isFinitePositive(size)) return null;

    if (mode === 'detailed') {
      const fracCount = (el.tex.match(/\\(?:d?frac|tfrac)\b/g) ?? []).length;
      const rootCount = (el.tex.match(/\\sqrt\b/g) ?? []).length;
      const sumLikeCount = (el.tex.match(/\\(?:sum|prod|int|lim)\b/g) ?? []).length;
      const matrixLikeCount = (
        el.tex.match(/\\(?:begin\{[^}]*matrix\}|begin\{array\}|cases|aligned|align)\b/g) ?? []
      ).length;
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

    // fast mode
    const width = Math.max(size * 1.5, el.tex.length * size * 0.5);
    const height = size * 1.5;
    return { minX: el.x, minY: el.y, maxX: el.x + width, maxY: el.y + height };
  }

  // matrix_bracket: compute bounds from grid dimensions and bracket insets
  if (el.type === 'matrix_bracket') {
    if (!allFinite(el.x, el.y)) return null;
    const parsedRows: string[][] = typeof el.rows === 'string'
      ? el.rows.split(';').map((r: string) => r.trim()).filter((r: string) => r.length > 0).map((r: string) => r.split(/\s+/))
      : el.rows;
    const numRows = parsedRows.length;
    const numCols = Math.max(...parsedRows.map((r: string[]) => r.length));
    const cw = el.cellWidth ?? 60;
    const ch = el.cellHeight ?? 32;
    const bracketInset = 12;
    const padX = 8;
    const totalW = bracketInset + padX + numCols * cw + padX + bracketInset;
    return { minX: el.x, minY: el.y - 4, maxX: el.x + totalW, maxY: el.y + numRows * ch + 4 };
  }

  // linear_transform: bounding box is the canvas rect
  if (el.type === 'linear_transform') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  // angle_arc: bounding box around the vertex ± arc radius (+ label margin)
  if (el.type === 'angle_arc') {
    if (!allFinite(el.x, el.y, el.radius, el.startAngle, el.endAngle) || !isFinitePositive(el.radius)) return null;
    const labelExtra = el.label ? el.radius * 0.3 : 0;
    const r = el.radius + labelExtra;
    return { minX: el.x - r, minY: el.y - r, maxX: el.x + r, maxY: el.y + r };
  }

  // integral_region: bounding box is the plot area
  if (el.type === 'integral_region') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  // cartesian_axes: bounding box covers the full axis span
  if (el.type === 'cartesian_axes') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    const xSpan = el.xRange[1] - el.xRange[0];
    const ySpan = el.yRange[1] - el.yRange[0];
    if (xSpan <= 0 || ySpan <= 0) return null;
    const xScale = el.width / xSpan;
    const yScale = el.height / ySpan;
    if (!Number.isFinite(xScale) || !Number.isFinite(yScale)) return null;
    const minX = el.x + el.xRange[0] * xScale;
    const maxX = el.x + el.xRange[1] * xScale;
    const minY = el.y - el.yRange[1] * yScale;
    const maxY = el.y - el.yRange[0] * yScale;
    return { minX, minY, maxX, maxY };
  }

  // number_line: horizontal line with tick margin
  if (el.type === 'number_line') {
    if (!allFinite(el.x, el.y, el.length) || !isFinitePositive(el.length)) return null;
    return { minX: el.x, minY: el.y - 20, maxX: el.x + el.length, maxY: el.y + 20 };
  }

  // vector_arrow: bounding box from tail to tip
  if (el.type === 'vector_arrow') {
    if (!allFinite(el.x, el.y, el.dx, el.dy)) return null;
    return {
      minX: Math.min(el.x, el.x + el.dx),
      minY: Math.min(el.y, el.y + el.dy),
      maxX: Math.max(el.x, el.x + el.dx),
      maxY: Math.max(el.y, el.y + el.dy),
    };
  }

  // circle_with_radius: center ± radius
  if (el.type === 'circle_with_radius') {
    if (!allFinite(el.cx, el.cy, el.r) || !isFinitePositive(el.r)) return null;
    return {
      minX: el.cx - el.r,
      minY: el.cy - el.r,
      maxX: el.cx + el.r,
      maxY: el.cy + el.r,
    };
  }

  // function_curve: bounding box is the plot area
  if (el.type === 'function_curve') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  // parametric_curve: bounding box is the plot area
  if (el.type === 'parametric_curve') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  // polar_plot: bounding box is center ± radius
  if (el.type === 'polar_plot') {
    if (!allFinite(el.cx, el.cy, el.radius) || !isFinitePositive(el.radius)) return null;
    return {
      minX: el.cx - el.radius,
      minY: el.cy - el.radius,
      maxX: el.cx + el.radius,
      maxY: el.cy + el.radius,
    };
  }

  // triangle_with_angles: bounding box of all vertices
  if (el.type === 'triangle_with_angles') {
    const xs = el.vertices.map((v) => v.x);
    const ys = el.vertices.map((v) => v.y);
    if (!allFinite(...xs, ...ys)) return null;
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }

  // histogram: bounding box is the plot area
  if (el.type === 'histogram') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  // normal_distribution: bounding box is the plot area
  if (el.type === 'normal_distribution') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  return null;
}
