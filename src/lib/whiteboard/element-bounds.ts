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

  // slope_field: bounding box is the plot area
  if (el.type === 'slope_field') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  // vector_field_2d: bounding box is the plot area
  if (el.type === 'vector_field_2d') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  // wireframe_3d: bounding box is center ± size
  if (el.type === 'wireframe_3d') {
    if (!allFinite(el.cx, el.cy, el.size) || !isFinitePositive(el.size)) return null;
    return {
      minX: el.cx - el.size,
      minY: el.cy - el.size,
      maxX: el.cx + el.size,
      maxY: el.cy + el.size,
    };
  }

  // sequence_plot: bounding box is the plot area
  if (el.type === 'sequence_plot') {
    if (!allFinite(el.x, el.y, el.width, el.height) || !isFinitePositive(el.width) || !isFinitePositive(el.height)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }

  // bezier_curve: bounding box of all control points
  if (el.type === 'bezier_curve') {
    if (!el.points || el.points.length < 2) return null;
    const xs = el.points.map((p) => p[0]);
    const ys = el.points.map((p) => p[1]);
    if (!allFinite(...xs, ...ys)) return null;
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }

  // complex_plane: default 400×400 canvas region
  if (el.type === 'complex_plane') {
    return { minX: 500, minY: 150, maxX: 900, maxY: 550 };
  }

  // number_theory_grid: bounding box from center, n, cellSize
  if (el.type === 'number_theory_grid') {
    const cellSize = el.cellSize ?? 20;
    const total = el.n * cellSize;
    if (!allFinite(el.cx, el.cy) || !isFinitePositive(total)) return null;
    return {
      minX: el.cx - total / 2,
      minY: el.cy - total / 2,
      maxX: el.cx + total / 2,
      maxY: el.cy + total / 2,
    };
  }

  // polygon: bounding box of all vertices (explicit or regular)
  if (el.type === 'polygon') {
    if (el.vertices && el.vertices.length >= 3) {
      const xs = el.vertices.map((v) => v.x);
      const ys = el.vertices.map((v) => v.y);
      if (!allFinite(...xs, ...ys)) return null;
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    if (el.sides && el.sides >= 3) {
      const cx = el.centerX ?? 400;
      const cy = el.centerY ?? 300;
      const r = el.radius ?? 80;
      if (!allFinite(cx, cy, r)) return null;
      return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
    }
    return null;
  }

  // geometric_construction: bounding box of all step coordinates
  if (el.type === 'geometric_construction') {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const step of el.steps) {
      if (step.x !== undefined) xs.push(step.x);
      if (step.y !== undefined) ys.push(step.y);
      if (step.x1 !== undefined) xs.push(step.x1);
      if (step.y1 !== undefined) ys.push(step.y1);
      if (step.x2 !== undefined) xs.push(step.x2);
      if (step.y2 !== undefined) ys.push(step.y2);
      if (step.cx !== undefined && step.r !== undefined) {
        xs.push(step.cx - step.r, step.cx + step.r);
        ys.push(step.cy! - step.r, step.cy! + step.r);
      }
    }
    if (xs.length === 0 || ys.length === 0 || !allFinite(...xs, ...ys)) return null;
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }

  // symbol_grid: grid of cells
  if (el.type === 'symbol_grid') {
    const cellW = el.cellWidth ?? 60;
    const cellH = el.cellHeight ?? 50;
    const n = el.symbols.length;
    const cols = el.columns ?? Math.max(1, Math.round(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    const titleOffset = el.title ? 25 : 0;
    if (!allFinite(el.x, el.y)) return null;
    return {
      minX: el.x,
      minY: el.y - titleOffset,
      maxX: el.x + cols * cellW,
      maxY: el.y + rows * cellH,
    };
  }

  // equation_system: stacked equations
  if (el.type === 'equation_system') {
    const fontSize = el.fontSize ?? 16;
    const lineSpacing = el.lineSpacing ?? 35;
    const n = el.equations.length;
    const titleOffset = el.title ? 25 : 0;
    if (!allFinite(el.x, el.y)) return null;
    const estimatedWidth = Math.max(120, fontSize * 12);
    const totalHeight = n * lineSpacing + titleOffset;
    return {
      minX: el.x,
      minY: el.y - titleOffset,
      maxX: el.x + estimatedWidth,
      maxY: el.y + totalHeight,
    };
  }

  // comparison_chart: bounding box is the plot area
  if (el.type === 'comparison_chart') {
    const w = el.width ?? 400;
    const h = el.height ?? 250;
    if (!allFinite(el.x, el.y) || !isFinitePositive(w) || !isFinitePositive(h)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + w, maxY: el.y + h };
  }

  // box_plot: bounding box is the plot area
  if (el.type === 'box_plot') {
    const w = el.width ?? 400;
    const h = el.height ?? 200;
    if (!allFinite(el.x, el.y) || !isFinitePositive(w) || !isFinitePositive(h)) return null;
    return { minX: el.x, minY: el.y, maxX: el.x + w, maxY: el.y + h };
  }

  // annotation_arrow: bounding box spans label and target positions
  if (el.type === 'annotation_arrow') {
    const fs = el.fontSize ?? 16;
    if (!allFinite(el.targetX, el.targetY, el.labelX, el.labelY)) return null;
    return {
      minX: Math.min(el.targetX, el.labelX) - fs,
      minY: Math.min(el.targetY, el.labelY) - fs,
      maxX: Math.max(el.targetX, el.labelX) + fs * el.text.length * 0.6,
      maxY: Math.max(el.targetY, el.labelY) + fs,
    };
  }

  // formula_box: bounding box is the box dimensions
  if (el.type === 'formula_box') {
    const padding = el.padding ?? 12;
    const fontSize = el.fontSize ?? 16;
    const autoWidth = el.width ?? Math.max(180, Math.min(800, el.formula.length * fontSize * 0.5 + padding * 2));
    const titleHeight = el.title ? fontSize + 8 : 0;
    const autoHeight = el.height ?? (fontSize * 2 + padding * 2 + titleHeight);
    if (!allFinite(el.x, el.y)) return null;
    return {
      minX: el.x,
      minY: el.y,
      maxX: el.x + autoWidth,
      maxY: el.y + autoHeight,
    };
  }

  // venn_diagram: bounding box from center and radius
  if (el.type === 'venn_diagram') {
    const r = el.radius ?? 80;
    if (!allFinite(el.x, el.y)) return null;
    const spread = r * 1.5;
    return {
      minX: el.x - spread,
      minY: el.y - spread - 30,
      maxX: el.x + spread,
      maxY: el.y + spread,
    };
  }

  // truth_table: bounding box from cell dimensions
  if (el.type === 'truth_table') {
    const cw = el.cellWidth ?? 60;
    const ch = el.cellHeight ?? 30;
    const cols = (el.variables?.length ?? 0) + (el.outputs?.length ?? 0);
    const rows = Math.pow(2, el.variables?.length ?? 0) + 1;
    if (!allFinite(el.x, el.y)) return null;
    return {
      minX: el.x,
      minY: el.y,
      maxX: el.x + cols * cw,
      maxY: el.y + rows * ch,
    };
  }

  // interval_diagram: horizontal line with padding
  if (el.type === 'interval_diagram') {
    const w = el.width ?? 400;
    if (!allFinite(el.x, el.y)) return null;
    return {
      minX: el.x,
      minY: el.y - 40,
      maxX: el.x + w,
      maxY: el.y + 50,
    };
  }

  return null;
}
