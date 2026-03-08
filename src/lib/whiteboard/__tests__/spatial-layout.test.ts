import { describe, it, expect } from 'vitest';
import {
  computeSpatialSummary,
  mergeOccupiedRegions,
  whiteboardBoundsToRects,
  suggestRegions,
  CANVAS_W,
  CANVAS_H,
  GRID_CELL_W,
  GRID_CELL_H,
} from '@/lib/whiteboard/planner/spatial-layout';
import { buildStructuredWhiteboardContext } from '@/lib/whiteboard/planner/context-v2';
import type { DrawElement, RectElement } from '@/types/agent';

function makeRect(x: number, y: number, w: number, h: number, id = 'r1'): RectElement {
  return { type: 'rect', id, x, y, w, h };
}

describe('Spatial Layout — computeSpatialSummary', () => {
  it('empty canvas → largest_free_region covers most of the canvas', () => {
    const result = computeSpatialSummary([]);

    expect(result.occupied_regions).toHaveLength(0);
    expect(result.free_regions.length).toBeGreaterThan(0);
    expect(result.largest_free_region).not.toBeNull();

    // The largest free region should cover the full canvas
    const lfr = result.largest_free_region!;
    expect(lfr.x).toBe(0);
    expect(lfr.y).toBe(0);
    expect(lfr.w).toBe(CANVAS_W);
    expect(lfr.h).toBe(CANVAS_H);
  });

  it('canvas with one drawing at top-left → free region is rest of canvas', () => {
    // Occupy the top-left 300×200 area (exactly one grid cell)
    const result = computeSpatialSummary([{ x: 10, y: 10, w: 200, h: 150 }]);

    expect(result.occupied_regions.length).toBeGreaterThan(0);
    expect(result.occupied_regions[0].label).toContain('existing drawing');

    // Should have fewer free cells than empty canvas
    const emptyResult = computeSpatialSummary([]);
    expect(result.free_regions.length).toBeLessThan(emptyResult.free_regions.length);

    // Largest free region should still exist and be sizable
    expect(result.largest_free_region).not.toBeNull();
    const lfr = result.largest_free_region!;
    expect(lfr.w * lfr.h).toBeGreaterThan(0);
  });

  it('canvas mostly full → smallest possible free region found', () => {
    // Fill most of the canvas with occupied regions
    const cols = Math.ceil(CANVAS_W / GRID_CELL_W);
    const rows = Math.ceil(CANVAS_H / GRID_CELL_H);
    const regions: Array<{ x: number; y: number; w: number; h: number }> = [];

    // Leave only bottom-right cell free — use tight regions to avoid
    // padding-merge touching the free cell
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (row === rows - 1 && col === cols - 1) continue; // leave one free
        regions.push({
          x: col * GRID_CELL_W + 60,
          y: row * GRID_CELL_H + 60,
          w: GRID_CELL_W - 120,
          h: GRID_CELL_H - 120,
        });
      }
    }

    const result = computeSpatialSummary(regions);

    // Should find at least 1 free region
    expect(result.free_regions.length).toBeGreaterThanOrEqual(1);

    // Largest free region should exist
    expect(result.largest_free_region).not.toBeNull();
  });

  it('completely full canvas → no free regions', () => {
    // One giant region covering the entire canvas plus padding
    const result = computeSpatialSummary([{ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }]);

    expect(result.free_regions).toHaveLength(0);
    expect(result.largest_free_region).toBeNull();
  });
});

describe('Spatial Layout — mergeOccupiedRegions', () => {
  it('non-overlapping regions stay separate', () => {
    const result = mergeOccupiedRegions(
      [
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 500, y: 500, w: 100, h: 100 },
      ],
      10, // small padding so they don't touch
    );
    expect(result).toHaveLength(2);
  });

  it('overlapping regions merge into one', () => {
    const result = mergeOccupiedRegions([
      { x: 0, y: 0, w: 200, h: 200 },
      { x: 150, y: 150, w: 200, h: 200 },
    ]);
    expect(result).toHaveLength(1);
  });

  it('adjacent regions within padding merge', () => {
    const result = mergeOccupiedRegions(
      [
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 130, y: 0, w: 100, h: 100 },
      ],
      50, // padding = 50 makes them overlap
    );
    expect(result).toHaveLength(1);
  });
});

describe('Spatial Layout — integration with context-v2', () => {
  it('buildStructuredWhiteboardContext includes spatial_summary', () => {
    const elements: DrawElement[] = [makeRect(100, 50, 400, 300)];
    const ctx = buildStructuredWhiteboardContext(elements);

    expect(ctx.spatial_summary).toBeDefined();
    expect(ctx.spatial_summary!.occupied_regions.length).toBeGreaterThan(0);
    expect(ctx.spatial_summary!.free_regions.length).toBeGreaterThan(0);
    expect(ctx.spatial_summary!.largest_free_region).not.toBeNull();
  });

  it('empty elements produce full-canvas free region', () => {
    const ctx = buildStructuredWhiteboardContext([]);

    expect(ctx.spatial_summary).toBeDefined();
    expect(ctx.spatial_summary!.occupied_regions).toHaveLength(0);
    expect(ctx.spatial_summary!.largest_free_region).not.toBeNull();
    const lfr = ctx.spatial_summary!.largest_free_region!;
    // Should cover the entire canvas (grid aligns to canvas dimensions)
    expect(lfr.x).toBe(0);
    expect(lfr.y).toBe(0);
    expect(lfr.w).toBe(CANVAS_W);
    expect(lfr.h).toBe(CANVAS_H);
  });
});

describe('Spatial Layout — whiteboardBoundsToRects', () => {
  it('filters out zero-dimension regions', () => {
    const result = whiteboardBoundsToRects([
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 50, y: 50, w: 0, h: 100 },
      { x: 50, y: 50, w: 100, h: 0 },
    ]);
    expect(result).toHaveLength(1);
  });
});

describe('Spatial Layout — suggestRegions', () => {
  it('returns n non-overlapping regions on an empty canvas', () => {
    const regions = suggestRegions(3, CANVAS_W, CANVAS_H, []);
    expect(regions).toHaveLength(3);

    // All regions should have positive area
    for (const r of regions) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }

    // No pair should overlap
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i];
        const b = regions[j];
        const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
        const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('returns 2 regions split into left and right halves', () => {
    const regions = suggestRegions(2, CANVAS_W, CANVAS_H, []);
    expect(regions).toHaveLength(2);

    const [left, right] = regions;
    // Left region should be in the left half
    expect(left.x + left.w).toBeLessThanOrEqual(CANVAS_W / 2 + 50);
    // Right region should be in the right half
    expect(right.x).toBeGreaterThanOrEqual(CANVAS_W / 2 - 50);
  });

  it('returns 4 quadrant regions', () => {
    const regions = suggestRegions(4, CANVAS_W, CANVAS_H, []);
    expect(regions).toHaveLength(4);

    // Each region should have positive dimensions
    for (const r of regions) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }

    // Should be arranged in a 2×2 grid — top-left, top-right, bottom-left, bottom-right
    expect(regions[0].x).toBeLessThan(regions[1].x); // TL < TR horizontally
    expect(regions[2].y).toBeGreaterThan(regions[0].y); // BL below TL
  });

  it('avoids occupied areas by shrinking regions', () => {
    // Occupy the entire left third of the canvas
    const occupied = [{ x: 0, y: 0, w: 500, h: CANVAS_H }];
    const regions = suggestRegions(2, CANVAS_W, CANVAS_H, occupied);
    expect(regions).toHaveLength(2);

    // The left region should be shrunk or shifted to avoid the occupied area
    const leftRegion = regions[0];
    // It should not start at x=50 since that area is occupied
    // Either its area is reduced or it's offset rightward
    const leftEnd = leftRegion.x + leftRegion.w;
    const rightStart = regions[1].x;
    expect(leftEnd).toBeLessThanOrEqual(rightStart + 1);
  });

  it('returns zero-area regions when canvas is fully occupied', () => {
    const occupied = [{ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }];
    const regions = suggestRegions(3, CANVAS_W, CANVAS_H, occupied);
    expect(regions).toHaveLength(3);

    // All regions should be zero-area since the entire canvas is occupied
    for (const r of regions) {
      expect(r.w * r.h).toBe(0);
    }
  });
});
