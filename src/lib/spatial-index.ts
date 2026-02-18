// Spatial index wrapper — will use rbush when dependency is installed
import type { BoundingBox, DrawElement } from '@/types';

export interface SpatialIndex {
  insert(element: DrawElement): void;
  remove(id: string): void;
  search(viewport: BoundingBox): DrawElement[];
  clear(): void;
}

/** Naive spatial index (linear scan). Replace with rbush in production. */
export function createSpatialIndex(): SpatialIndex {
  const items = new Map<string, DrawElement>();

  return {
    insert(element) {
      items.set(element.id, element);
    },
    remove(id) {
      items.delete(id);
    },
    search(_viewport) {
      // TODO: use rbush for O(log n) culling
      return Array.from(items.values());
    },
    clear() {
      items.clear();
    },
  };
}
