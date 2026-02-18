import RBush from 'rbush';
import type { DrawElement, Point } from '@/types';
import type { BoundingBox } from '@/types/drawing';

// R-tree item wrapping a DrawElement with its bounding box
interface RBushItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  element: DrawElement;
}

/** Compute axis-aligned bounding box for any DrawElement. */
function elementBounds(el: DrawElement): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (el.type) {
    case 'rect':
    case 'text':
    case 'image':
      return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
    case 'ellipse':
      return { minX: el.x - el.rx, minY: el.y - el.ry, maxX: el.x + el.rx, maxY: el.y + el.ry };
    case 'line':
    case 'arrow':
    case 'freehand': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of el.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { minX, minY, maxX, maxY };
    }
  }
}

/** Check if a point is inside a polygon (ray-casting algorithm). */
function pointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (
      pi.y > py !== pj.y > py &&
      px < ((pj.x - pi.x) * (py - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export type SelectionMode = 'replace' | 'add' | 'toggle';

export interface SelectionHighlight {
  elementId: string;
  bounds: BoundingBox;
}

export class SelectionManager {
  private tree = new RBush<RBushItem>();
  private itemMap = new Map<string, RBushItem>();
  private selected = new Set<string>();

  /** Bulk-load elements into the R-tree index. */
  load(elements: DrawElement[]): void {
    this.tree.clear();
    this.itemMap.clear();
    const items: RBushItem[] = [];
    for (const el of elements) {
      const b = elementBounds(el);
      const item: RBushItem = { ...b, element: el };
      items.push(item);
      this.itemMap.set(el.id, item);
    }
    this.tree.load(items);
  }

  /** Insert a single element. */
  insert(element: DrawElement): void {
    this.remove(element.id);
    const b = elementBounds(element);
    const item: RBushItem = { ...b, element };
    this.itemMap.set(element.id, item);
    this.tree.insert(item);
  }

  /** Remove an element by id. */
  remove(id: string): void {
    const existing = this.itemMap.get(id);
    if (existing) {
      this.tree.remove(existing);
      this.itemMap.delete(id);
    }
    this.selected.delete(id);
  }

  /** O(log n) hit-test: find elements within radius of (x, y). */
  hitTest(x: number, y: number, radius = 4): DrawElement[] {
    const results = this.tree.search({
      minX: x - radius,
      minY: y - radius,
      maxX: x + radius,
      maxY: y + radius,
    });
    // Sort by insertion order (later = on top) so topmost is last
    return results.map((r) => r.element);
  }

  /** Hit-test returning only the topmost element. */
  hitTestSingle(x: number, y: number, radius = 4): DrawElement | null {
    const hits = this.hitTest(x, y, radius);
    return hits.length > 0 ? hits[hits.length - 1]! : null;
  }

  /** Marquee selection: find all elements intersecting a rectangle. */
  marqueeSelect(rect: BoundingBox, mode: SelectionMode = 'replace'): Set<string> {
    const results = this.tree.search({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.w,
      maxY: rect.y + rect.h,
    });
    const ids = new Set(results.map((r) => r.element.id));
    return this.applyMode(ids, mode);
  }

  /** Lasso selection: find all elements whose center is inside the freehand polygon. */
  lassoSelect(polygon: Point[], mode: SelectionMode = 'replace'): Set<string> {
    if (polygon.length < 3) return this.selected;

    // Compute polygon bounding box for broad-phase
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const candidates = this.tree.search({ minX, minY, maxX, maxY });
    const ids = new Set<string>();
    for (const c of candidates) {
      const cx = (c.minX + c.maxX) / 2;
      const cy = (c.minY + c.maxY) / 2;
      if (pointInPolygon(cx, cy, polygon)) {
        ids.add(c.element.id);
      }
    }
    return this.applyMode(ids, mode);
  }

  /** Apply selection mode (replace/add/toggle). */
  private applyMode(newIds: Set<string>, mode: SelectionMode): Set<string> {
    switch (mode) {
      case 'replace':
        this.selected = new Set(newIds);
        break;
      case 'add':
        for (const id of newIds) this.selected.add(id);
        break;
      case 'toggle':
        for (const id of newIds) {
          if (this.selected.has(id)) this.selected.delete(id);
          else this.selected.add(id);
        }
        break;
    }
    return new Set(this.selected);
  }

  // ── Multi-select state ──────────────────────────────────

  selectElement(id: string, mode: SelectionMode = 'replace'): Set<string> {
    return this.applyMode(new Set([id]), mode);
  }

  deselectAll(): Set<string> {
    this.selected.clear();
    return new Set(this.selected);
  }

  toggleSelect(id: string): Set<string> {
    return this.selectElement(id, 'toggle');
  }

  getSelectedIds(): Set<string> {
    return new Set(this.selected);
  }

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  // ── Selection highlighting overlay ──────────────────────

  getSelectionHighlights(): SelectionHighlight[] {
    const highlights: SelectionHighlight[] = [];
    for (const id of this.selected) {
      const item = this.itemMap.get(id);
      if (item) {
        highlights.push({
          elementId: id,
          bounds: {
            x: item.minX,
            y: item.minY,
            w: item.maxX - item.minX,
            h: item.maxY - item.minY,
          },
        });
      }
    }
    return highlights;
  }

  /** Viewport culling: return only elements visible in the viewport. */
  getVisibleElements(viewport: BoundingBox): DrawElement[] {
    return this.tree
      .search({
        minX: viewport.x,
        minY: viewport.y,
        maxX: viewport.x + viewport.w,
        maxY: viewport.y + viewport.h,
      })
      .map((r) => r.element);
  }

  clear(): void {
    this.tree.clear();
    this.itemMap.clear();
    this.selected.clear();
  }
}
