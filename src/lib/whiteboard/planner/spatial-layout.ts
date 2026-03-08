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

  // Grid-based free region detection
  const cols = Math.max(1, Math.floor(canvasW / GRID_CELL_W));
  const rows = Math.max(1, Math.floor(canvasH / GRID_CELL_H));
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
