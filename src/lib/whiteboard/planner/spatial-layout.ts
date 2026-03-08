import type { SpatialBounds, SpatialSummary, WhiteboardBounds } from '@/types/agent';

const CANVAS_W = 1400;
const CANVAS_H = 700;
const PADDING = 50;
const GRID_CELL_W = 300;
const GRID_CELL_H = 200;

export { CANVAS_W, CANVAS_H, PADDING, GRID_CELL_W, GRID_CELL_H };

/** Check whether two rectangles overlap. */
function overlaps(a: SpatialBounds, b: SpatialBounds): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Merge overlapping / adjacent occupied rectangles (with padding) into
 * consolidated regions. Uses a greedy single-pass merge: iterate until
 * no further merges occur.
 */
export function mergeOccupiedRegions(
  regions: Array<{ x: number; y: number; w: number; h: number }>,
  padding: number = PADDING,
): SpatialBounds[] {
  if (regions.length === 0) return [];

  // Expand each region by padding for adjacency detection
  let merged: SpatialBounds[] = regions.map((r) => ({
    x: r.x - padding,
    y: r.y - padding,
    w: r.w + padding * 2,
    h: r.h + padding * 2,
  }));

  let changed = true;
  while (changed) {
    changed = false;
    const next: SpatialBounds[] = [];
    const used = new Set<number>();

    for (let i = 0; i < merged.length; i++) {
      if (used.has(i)) continue;
      let current = { ...merged[i] };
      for (let j = i + 1; j < merged.length; j++) {
        if (used.has(j)) continue;
        if (overlaps(current, merged[j])) {
          const x = Math.min(current.x, merged[j].x);
          const y = Math.min(current.y, merged[j].y);
          const maxX = Math.max(current.x + current.w, merged[j].x + merged[j].w);
          const maxY = Math.max(current.y + current.h, merged[j].y + merged[j].h);
          current = { x, y, w: maxX - x, h: maxY - y };
          used.add(j);
          changed = true;
        }
      }
      next.push(current);
    }
    merged = next;
  }

  return merged;
}

function labelForGridCell(col: number, row: number, cols: number, rows: number): string {
  const vLabel = rows <= 1 ? '' : row === 0 ? 'top' : row === rows - 1 ? 'bottom' : 'middle';
  const hLabel = cols <= 1 ? '' : col === 0 ? 'left' : col === cols - 1 ? 'right' : 'center';
  const parts = [vLabel, hLabel].filter(Boolean);
  return parts.length > 0 ? `${parts.join('-')} area` : 'center area';
}

/**
 * Convert occupied_regions from StructuredWhiteboardContext into a
 * SpatialSummary with merged occupied regions, free grid cells, and
 * the largest free region.
 */
export function computeSpatialSummary(
  occupiedRegions: Array<{ x: number; y: number; w: number; h: number }>,
  canvasW: number = CANVAS_W,
  canvasH: number = CANVAS_H,
): SpatialSummary {
  const merged = mergeOccupiedRegions(occupiedRegions);

  // Build labeled occupied regions (shrink back by padding for display)
  const occupiedLabeled = merged.map((r, i) => ({
    label: merged.length === 1 ? 'existing drawing' : `existing drawing ${i + 1}`,
    bounds: {
      x: Math.max(0, r.x + PADDING),
      y: Math.max(0, r.y + PADDING),
      w: Math.max(0, r.w - PADDING * 2),
      h: Math.max(0, r.h - PADDING * 2),
    },
  }));

  // Grid-based free region detection — include partial edge cells
  const cols = Math.ceil(canvasW / GRID_CELL_W);
  const rows = Math.ceil(canvasH / GRID_CELL_H);
  const freeRegions: SpatialSummary['free_regions'] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell: SpatialBounds = {
        x: col * GRID_CELL_W,
        y: row * GRID_CELL_H,
        w: Math.min(GRID_CELL_W, canvasW - col * GRID_CELL_W),
        h: Math.min(GRID_CELL_H, canvasH - row * GRID_CELL_H),
      };

      const isOccupied = merged.some((m) => overlaps(cell, m));
      if (!isOccupied) {
        freeRegions.push({
          label: labelForGridCell(col, row, cols, rows),
          bounds: cell,
          area: cell.w * cell.h,
        });
      }
    }
  }

  // Also try merging adjacent free grid cells into larger contiguous blocks.
  // For simplicity we just report sorted individual cells plus a merged
  // largest-free-region scan.
  freeRegions.sort((a, b) => b.area - a.area);

  // Find largest contiguous free rectangle by scanning merged free cells
  let largest: SpatialBounds | null = null;
  if (freeRegions.length > 0) {
    // Try merging adjacent free cells row-by-row for larger regions
    const freeSet = new Set<string>();
    for (const r of freeRegions) {
      const cCol = Math.round(r.bounds.x / GRID_CELL_W);
      const cRow = Math.round(r.bounds.y / GRID_CELL_H);
      freeSet.add(`${cCol},${cRow}`);
    }

    let bestArea = 0;
    for (let r1 = 0; r1 < rows; r1++) {
      for (let c1 = 0; c1 < cols; c1++) {
        if (!freeSet.has(`${c1},${r1}`)) continue;
        // Expand right & down as far as all cells are free
        for (let r2 = r1; r2 < rows; r2++) {
          for (let c2 = c1; c2 < cols; c2++) {
            // Check full rectangle
            let allFree = true;
            for (let rr = r1; rr <= r2 && allFree; rr++) {
              for (let cc = c1; cc <= c2 && allFree; cc++) {
                if (!freeSet.has(`${cc},${rr}`)) allFree = false;
              }
            }
            if (!allFree) break; // expanding right further won't help

            const w = Math.min((c2 - c1 + 1) * GRID_CELL_W, canvasW - c1 * GRID_CELL_W);
            const h = Math.min((r2 - r1 + 1) * GRID_CELL_H, canvasH - r1 * GRID_CELL_H);
            const area = w * h;
            if (area > bestArea) {
              bestArea = area;
              largest = { x: c1 * GRID_CELL_W, y: r1 * GRID_CELL_H, w, h };
            }
          }
        }
      }
    }
  }

  // Fallback: if no grid cell is free, entire canvas is occupied
  if (!largest && freeRegions.length === 0) {
    largest = null;
  }

  return { occupied_regions: occupiedLabeled, free_regions: freeRegions, largest_free_region: largest };
}

/**
 * Suggest `n` non-overlapping placement regions for new diagrams.
 *
 * Layout strategy:
 * - n=1: largest free area
 * - n=2: left half / right half
 * - n=3: three equal columns
 * - n=4: quadrants
 * - n≥5: grid with ceil(n/cols) rows
 *
 * Each candidate region is shrunk to avoid already-occupied areas.
 * Regions that are fully occluded are still returned (at zero area) so
 * callers always get exactly `n` entries.
 */
export function suggestRegions(
  n: number,
  canvasWidth: number = CANVAS_W,
  canvasHeight: number = CANVAS_H,
  occupiedRects: Array<{ x: number; y: number; w: number; h: number }> = [],
): SpatialBounds[] {
  if (n <= 0) return [];

  const margin = PADDING;
  const gap = PADDING;

  const safeX = margin;
  const safeY = margin;
  const safeW = canvasWidth - margin * 2;
  const safeH = canvasHeight - margin * 2;

  // Determine grid layout: cols × rows
  let cols: number;
  let rows: number;
  if (n === 1) {
    cols = 1;
    rows = 1;
  } else if (n === 2) {
    cols = 2;
    rows = 1;
  } else if (n === 3) {
    cols = 3;
    rows = 1;
  } else if (n === 4) {
    cols = 2;
    rows = 2;
  } else {
    cols = Math.ceil(Math.sqrt(n));
    rows = Math.ceil(n / cols);
  }

  const cellW = (safeW - gap * (cols - 1)) / cols;
  const cellH = (safeH - gap * (rows - 1)) / rows;

  const merged = mergeOccupiedRegions(occupiedRects, margin);

  const regions: SpatialBounds[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const rx = safeX + col * (cellW + gap);
    const ry = safeY + row * (cellH + gap);

    // Shrink candidate to avoid occupied areas
    let bestRect: SpatialBounds = { x: rx, y: ry, w: cellW, h: cellH };

    for (const occ of merged) {
      bestRect = subtractLargestRect(bestRect, occ);
    }

    regions.push(bestRect);
  }

  return regions;
}

/**
 * Given a candidate rectangle and an occupied rectangle, return the
 * largest axis-aligned sub-rectangle of `candidate` that does not
 * overlap `occupied`. If there is no overlap the original candidate
 * is returned unchanged.
 */
function subtractLargestRect(candidate: SpatialBounds, occupied: SpatialBounds): SpatialBounds {
  if (!overlaps(candidate, occupied)) return candidate;

  // The occupied rect splits the candidate into up to 4 sub-rects
  // (top, bottom, left, right).  Pick the largest.
  const slices: SpatialBounds[] = [];

  // Top slice
  if (occupied.y > candidate.y) {
    slices.push({
      x: candidate.x,
      y: candidate.y,
      w: candidate.w,
      h: occupied.y - candidate.y,
    });
  }
  // Bottom slice
  const occBottom = occupied.y + occupied.h;
  const candBottom = candidate.y + candidate.h;
  if (occBottom < candBottom) {
    slices.push({
      x: candidate.x,
      y: occBottom,
      w: candidate.w,
      h: candBottom - occBottom,
    });
  }
  // Left slice
  if (occupied.x > candidate.x) {
    slices.push({
      x: candidate.x,
      y: candidate.y,
      w: occupied.x - candidate.x,
      h: candidate.h,
    });
  }
  // Right slice
  const occRight = occupied.x + occupied.w;
  const candRight = candidate.x + candidate.w;
  if (occRight < candRight) {
    slices.push({
      x: occRight,
      y: candidate.y,
      w: candRight - occRight,
      h: candidate.h,
    });
  }

  if (slices.length === 0) {
    // Fully occluded — return a zero-area rect at the candidate origin
    return { x: candidate.x, y: candidate.y, w: 0, h: 0 };
  }

  // Return the slice with the largest area
  let best = slices[0];
  for (let i = 1; i < slices.length; i++) {
    if (slices[i].w * slices[i].h > best.w * best.h) {
      best = slices[i];
    }
  }
  return best;
}

/**
 * Convert WhiteboardBounds[] (from occupied_regions on the context) to
 * simple {x,y,w,h} rectangles for spatial computation.
 */
export function whiteboardBoundsToRects(
  regions: Array<{ x: number; y: number; w: number; h: number }>,
): Array<{ x: number; y: number; w: number; h: number }> {
  return regions
    .filter((r) => r.w > 0 && r.h > 0)
    .map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
}
