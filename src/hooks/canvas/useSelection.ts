'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { SelectionManager } from '@/lib/selection/SelectionManager';
import type { DrawElement, Point } from '@/types';
import type { BoundingBox } from '@/types/drawing';
import type { SelectionHighlight, SelectionMode } from '@/lib/selection/SelectionManager';

export interface UseSelectionReturn {
  /** Currently selected element IDs. */
  selectedIds: string[];
  /** Select a single element. */
  selectElement: (id: string, mode?: SelectionMode) => void;
  /** Deselect all elements. */
  deselectAll: () => void;
  /** Toggle selection on an element. */
  toggleSelect: (id: string) => void;
  /** Hit-test at a point. */
  hitTest: (x: number, y: number, radius?: number) => DrawElement[];
  /** Perform marquee selection. */
  marqueeSelect: (rect: BoundingBox, mode?: SelectionMode) => void;
  /** Perform lasso selection. */
  lassoSelect: (polygon: Point[], mode?: SelectionMode) => void;
  /** Get selection highlight overlays. */
  getHighlights: () => SelectionHighlight[];
  /** Update the spatial index with current elements. */
  updateIndex: (elements: DrawElement[]) => void;
  /** The underlying SelectionManager instance. */
  manager: SelectionManager;
}

export function useSelection(): UseSelectionReturn {
  const managerRef = useRef(new SelectionManager());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const syncSelection = useCallback((ids: Set<string>) => {
    setSelectedIds(Array.from(ids));
  }, []);

  const selectElement = useCallback(
    (id: string, mode: SelectionMode = 'replace') => {
      syncSelection(managerRef.current.selectElement(id, mode));
    },
    [syncSelection],
  );

  const deselectAll = useCallback(() => {
    syncSelection(managerRef.current.deselectAll());
  }, [syncSelection]);

  const toggleSelect = useCallback(
    (id: string) => {
      syncSelection(managerRef.current.toggleSelect(id));
    },
    [syncSelection],
  );

  const hitTest = useCallback((x: number, y: number, radius?: number) => {
    return managerRef.current.hitTest(x, y, radius);
  }, []);

  const marqueeSelect = useCallback(
    (rect: BoundingBox, mode: SelectionMode = 'replace') => {
      syncSelection(managerRef.current.marqueeSelect(rect, mode));
    },
    [syncSelection],
  );

  const lassoSelect = useCallback(
    (polygon: Point[], mode: SelectionMode = 'replace') => {
      syncSelection(managerRef.current.lassoSelect(polygon, mode));
    },
    [syncSelection],
  );

  const getHighlights = useCallback(() => {
    return managerRef.current.getSelectionHighlights();
  }, []);

  const updateIndex = useCallback((elements: DrawElement[]) => {
    managerRef.current.load(elements);
  }, []);

  return useMemo(
    () => ({
      selectedIds,
      selectElement,
      deselectAll,
      toggleSelect,
      hitTest,
      marqueeSelect,
      lassoSelect,
      getHighlights,
      updateIndex,
      manager: managerRef.current,
    }),
    [selectedIds, selectElement, deselectAll, toggleSelect, hitTest, marqueeSelect, lassoSelect, getHighlights, updateIndex],
  );
}
