import type { WhiteboardBounds } from '@/types/agent';

interface IndexedItem<T> {
  item: T;
  bounds: WhiteboardBounds;
}

export interface SpatialIndex<T> {
  insert(item: T, bounds: WhiteboardBounds): void;
  query(bounds: WhiteboardBounds): T[];
  clear(): void;
  size(): number;
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function createSpatialIndex<T>(cellSize = 100): SpatialIndex<T> {
  const grid = new Map<string, IndexedItem<T>[]>();
  let totalItems = 0;

  function cellRange(bounds: WhiteboardBounds): {
    minCol: number; maxCol: number; minRow: number; maxRow: number;
  } {
    return {
      minCol: Math.floor(bounds.minX / cellSize),
      maxCol: Math.floor(bounds.maxX / cellSize),
      minRow: Math.floor(bounds.minY / cellSize),
      maxRow: Math.floor(bounds.maxY / cellSize),
    };
  }

  function intersects(a: WhiteboardBounds, b: WhiteboardBounds): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX &&
           a.minY <= b.maxY && a.maxY >= b.minY;
  }

  return {
    insert(item: T, bounds: WhiteboardBounds): void {
      const { minCol, maxCol, minRow, maxRow } = cellRange(bounds);
      const entry: IndexedItem<T> = { item, bounds };

      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          const key = cellKey(col, row);
          let bucket = grid.get(key);
          if (!bucket) {
            bucket = [];
            grid.set(key, bucket);
          }
          bucket.push(entry);
        }
      }
      totalItems++;
    },

    query(bounds: WhiteboardBounds): T[] {
      const { minCol, maxCol, minRow, maxRow } = cellRange(bounds);
      const seen = new Set<IndexedItem<T>>();
      const results: T[] = [];

      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          const bucket = grid.get(cellKey(col, row));
          if (!bucket) continue;
          for (const entry of bucket) {
            if (seen.has(entry)) continue;
            seen.add(entry);
            if (intersects(entry.bounds, bounds)) {
              results.push(entry.item);
            }
          }
        }
      }

      return results;
    },

    clear(): void {
      grid.clear();
      totalItems = 0;
    },

    size(): number {
      return totalItems;
    },
  };
}
