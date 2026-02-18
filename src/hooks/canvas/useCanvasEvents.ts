'use client';

import { useCallback, useRef } from 'react';
import type { UseSelectionReturn } from './useSelection';
import type { BoundingBox, Point, ToolType } from '@/types';

// ─── Types ──────────────────────────────────────────────────

type PointerEventHandler = (e: React.PointerEvent<HTMLElement>) => void;
type WheelEventHandler = (e: React.WheelEvent<HTMLElement>) => void;
type MouseEventHandler = (e: React.MouseEvent<HTMLElement>) => void;

export interface CanvasEventsOptions {
  /** Selection hook instance for hit-testing and selection state. */
  selection: UseSelectionReturn;
  /** Current active tool from the whiteboard store. */
  activeTool: ToolType;
  /** Convert screen coordinates to world/canvas coordinates. */
  screenToWorld: (sx: number, sy: number) => Point;
  /** Camera state for coordinate transforms. */
  camera: { x: number; y: number; zoom: number };
  /** Callback fired when elements are dragged (delta in world coords). */
  onDragMove?: (ids: string[], dx: number, dy: number) => void;
  /** Callback fired when a drag ends. */
  onDragEnd?: (ids: string[]) => void;
  /** Callback fired on double-click for text editing. */
  onDoubleClickElement?: (id: string, worldPos: Point) => void;
  /** Callback fired on right-click for context menu. */
  onContextMenu?: (worldPos: Point, elementId: string | null) => void;
  /** Callback fired when zoom changes via wheel. */
  onZoom?: (newZoom: number, anchor: Point) => void;
}

export interface UseCanvasEventsReturn {
  onMouseDown: PointerEventHandler;
  onMouseMove: PointerEventHandler;
  onMouseUp: PointerEventHandler;
  onContextMenu: MouseEventHandler;
  onWheel: WheelEventHandler;
}

// ─── Constants ──────────────────────────────────────────────

const MARQUEE_THRESHOLD = 4;
const DOUBLE_CLICK_MS = 400;
const ZOOM_SENSITIVITY = 0.001;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;

// ─── Interaction state ──────────────────────────────────────

type DragIntent = 'none' | 'select' | 'marquee' | 'move';

interface PointerState {
  isDown: boolean;
  intent: DragIntent;
  startScreen: Point;
  startWorld: Point;
  lastWorld: Point;
  /** Element ID at the initial click target (if any). */
  hitId: string | null;
  /** Whether Ctrl/Meta was held at pointer-down. */
  multiSelect: boolean;
  pointerId: number;
}

// ─── Hook ───────────────────────────────────────────────────

export function useCanvasEvents(opts: CanvasEventsOptions): UseCanvasEventsReturn {
  const {
    selection,
    activeTool,
    screenToWorld,
    camera,
    onDragMove,
    onDragEnd,
    onDoubleClickElement,
    onContextMenu: onContextMenuCb,
    onZoom,
  } = opts;

  const ptrState = useRef<PointerState>({
    isDown: false,
    intent: 'none',
    startScreen: { x: 0, y: 0 },
    startWorld: { x: 0, y: 0 },
    lastWorld: { x: 0, y: 0 },
    hitId: null,
    multiSelect: false,
    pointerId: -1,
  });

  const lastClickTime = useRef(0);
  const lastClickId = useRef<string | null>(null);

  // ── Pointer Down ────────────────────────────────────────

  const onMouseDown = useCallback<PointerEventHandler>(
    (e) => {
      // Only handle primary button (left-click / touch)
      if (e.button !== 0) return;

      // Prevent text selection while interacting with canvas
      e.preventDefault();

      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const screenPt: Point = { x: e.clientX, y: e.clientY };
      const rect = el.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const worldPt = screenToWorld(localX, localY);

      const isMulti = e.ctrlKey || e.metaKey;

      // Hit-test only when in select mode
      let hitId: string | null = null;
      if (activeTool === 'select') {
        const hits = selection.hitTest(worldPt.x, worldPt.y);
        hitId = hits.length > 0 ? hits[0]!.id : null;
      }

      // ── Double-click detection ──────────────────────────
      const now = Date.now();
      if (
        hitId &&
        hitId === lastClickId.current &&
        now - lastClickTime.current < DOUBLE_CLICK_MS
      ) {
        onDoubleClickElement?.(hitId, worldPt);
        lastClickTime.current = 0;
        lastClickId.current = null;
        return;
      }
      lastClickTime.current = now;
      lastClickId.current = hitId;

      // ── Determine intent ────────────────────────────────
      let intent: DragIntent = 'none';

      if (activeTool === 'select') {
        if (hitId) {
          // Ctrl+click toggles selection
          if (isMulti) {
            selection.toggleSelect(hitId);
          } else if (!selection.selectedIds.includes(hitId)) {
            selection.selectElement(hitId, 'replace');
          }
          intent = 'move';
        } else {
          // Click on empty space → start marquee or deselect
          if (!isMulti) {
            selection.deselectAll();
          }
          intent = 'select'; // may become marquee after threshold
        }
      }

      ptrState.current = {
        isDown: true,
        intent,
        startScreen: screenPt,
        startWorld: worldPt,
        lastWorld: worldPt,
        hitId,
        multiSelect: isMulti,
        pointerId: e.pointerId,
      };
    },
    [activeTool, selection, screenToWorld, onDoubleClickElement],
  );

  // ── Pointer Move ────────────────────────────────────────

  const onMouseMove = useCallback<PointerEventHandler>(
    (e) => {
      const ps = ptrState.current;
      if (!ps.isDown) return;
      if (activeTool !== 'select') return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const worldPt = screenToWorld(localX, localY);

      // ── Promote select intent to marquee after threshold ──
      if (ps.intent === 'select') {
        const dx = e.clientX - ps.startScreen.x;
        const dy = e.clientY - ps.startScreen.y;
        if (Math.abs(dx) > MARQUEE_THRESHOLD || Math.abs(dy) > MARQUEE_THRESHOLD) {
          ps.intent = 'marquee';
        }
      }

      // ── Marquee selection ─────────────────────────────────
      if (ps.intent === 'marquee') {
        const rect: BoundingBox = {
          x: Math.min(ps.startWorld.x, worldPt.x),
          y: Math.min(ps.startWorld.y, worldPt.y),
          w: Math.abs(worldPt.x - ps.startWorld.x),
          h: Math.abs(worldPt.y - ps.startWorld.y),
        };
        const mode = ps.multiSelect ? 'add' : 'replace';
        selection.marqueeSelect(rect, mode);
      }

      // ── Drag-to-move selected elements ────────────────────
      if (ps.intent === 'move') {
        const dx = worldPt.x - ps.lastWorld.x;
        const dy = worldPt.y - ps.lastWorld.y;
        if (dx !== 0 || dy !== 0) {
          onDragMove?.(selection.selectedIds, dx, dy);
        }
      }

      ps.lastWorld = worldPt;
    },
    [activeTool, selection, screenToWorld, onDragMove],
  );

  // ── Pointer Up ──────────────────────────────────────────

  const onMouseUp = useCallback<PointerEventHandler>(
    (e) => {
      const ps = ptrState.current;
      if (!ps.isDown) return;

      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

      // Notify drag end for move operations
      if (ps.intent === 'move') {
        onDragEnd?.(selection.selectedIds);
      }

      ptrState.current = {
        ...ps,
        isDown: false,
        intent: 'none',
      };
    },
    [selection, onDragEnd],
  );

  // ── Context Menu (right-click) ──────────────────────────

  const handleContextMenu = useCallback<MouseEventHandler>(
    (e) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const worldPt = screenToWorld(localX, localY);

      let elementId: string | null = null;
      if (activeTool === 'select') {
        const hits = selection.hitTest(worldPt.x, worldPt.y);
        elementId = hits.length > 0 ? hits[0]!.id : null;
      }

      onContextMenuCb?.(worldPt, elementId);
    },
    [activeTool, selection, screenToWorld, onContextMenuCb],
  );

  // ── Wheel (zoom) ────────────────────────────────────────

  const handleWheel = useCallback<WheelEventHandler>(
    (e) => {
      e.preventDefault();

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      const newZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, camera.zoom - e.deltaY * ZOOM_SENSITIVITY),
      );

      onZoom?.(newZoom, { x: localX, y: localY });
    },
    [camera.zoom, onZoom],
  );

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onContextMenu: handleContextMenu,
    onWheel: handleWheel,
  };
}
