'use client';

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '@/types';

// ── Constants ──────────────────────────────────────────────

const DRAG_THRESHOLD = 8; // px movement before drag is recognized

// ── Types ──────────────────────────────────────────────────

type GestureState = 'idle' | 'pending' | 'dragging' | 'two-finger' | 'three-finger';

interface PointerData {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface GestureInternals {
  state: GestureState;
  pointers: Map<number, PointerData>;
  initialPinchDistance: number;
  lastPinchCenter: Point;
  startZoom: number;
  undoFired: boolean;
}

export interface UseTouchGesturesOptions {
  /** Move the camera by (dx, dy) in screen pixels. */
  pan: (dx: number, dy: number) => void;
  /** Set absolute zoom level, optionally around an anchor point. */
  zoomTo: (zoom: number, anchor?: Point) => void;
  /** Current camera zoom level (used as base for pinch scaling). */
  currentZoom: number;
  /** Trigger an undo action (called on three-finger gesture). */
  undo: () => void;
  /** Called on single-finger tap. */
  onTap?: (position: Point) => void;
  /** Called when a single-finger drag begins. */
  onDragStart?: (position: Point) => void;
  /** Called during single-finger drag movement. */
  onDrag?: (position: Point, delta: Point) => void;
  /** Called when a single-finger drag ends. */
  onDragEnd?: (position: Point) => void;
}

export interface UseTouchGesturesReturn {
  /** Attach to element's onPointerDown. */
  onPointerDown: (e: ReactPointerEvent) => void;
  /** Attach to element's onPointerMove. */
  onPointerMove: (e: ReactPointerEvent) => void;
  /** Attach to element's onPointerUp and onPointerCancel. */
  onPointerUp: (e: ReactPointerEvent) => void;
}

// ── Geometry helpers ───────────────────────────────────────

function pointerDistance(a: PointerData, b: PointerData): number {
  const dx = a.currentX - b.currentX;
  const dy = a.currentY - b.currentY;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointerCenter(a: PointerData, b: PointerData): Point {
  return {
    x: (a.currentX + b.currentX) / 2,
    y: (a.currentY + b.currentY) / 2,
  };
}

// ── Hook ───────────────────────────────────────────────────

/**
 * Touch gesture handler for canvas interactions.
 *
 * Implements a gesture state machine supporting:
 * - Single-finger tap and drag
 * - Two-finger pan + pinch-to-zoom
 * - Three-finger undo
 *
 * The target element must have `touch-action: none` CSS to suppress
 * default browser gestures. Also forward `onPointerCancel` to the
 * returned `onPointerUp` handler.
 */
export function useTouchGestures(options: UseTouchGesturesOptions): UseTouchGesturesReturn {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });

  const gestureRef = useRef<GestureInternals>({
    state: 'idle',
    pointers: new Map(),
    initialPinchDistance: 0,
    lastPinchCenter: { x: 0, y: 0 },
    startZoom: 1,
    undoFired: false,
  });

  const getPointerPair = useCallback((): [PointerData, PointerData] | null => {
    const pts = Array.from(gestureRef.current.pointers.values());
    if (pts.length < 2) return null;
    return [pts[0]!, pts[1]!];
  }, []);

  const initTwoFinger = useCallback(() => {
    const g = gestureRef.current;
    const pair = getPointerPair();
    if (!pair) return;
    g.initialPinchDistance = pointerDistance(pair[0], pair[1]);
    g.lastPinchCenter = pointerCenter(pair[0], pair[1]);
    g.startZoom = optionsRef.current.currentZoom;
  }, [getPointerPair]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const g = gestureRef.current;

    // Suppress default browser gestures (text selection, context menus)
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    g.pointers.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });

    const count = g.pointers.size;

    if (count === 1) {
      g.state = 'pending';
    } else if (count === 2) {
      if (g.state === 'dragging') {
        const first = Array.from(g.pointers.values())[0]!;
        optionsRef.current.onDragEnd?.({ x: first.currentX, y: first.currentY });
      }
      g.state = 'two-finger';
      initTwoFinger();
    } else if (count >= 3) {
      g.state = 'three-finger';
      g.undoFired = false;
    }
  }, [initTwoFinger]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const g = gestureRef.current;
    const info = g.pointers.get(e.pointerId);
    if (!info) return;

    const prevX = info.currentX;
    const prevY = info.currentY;
    info.currentX = e.clientX;
    info.currentY = e.clientY;

    switch (g.state) {
      case 'pending': {
        const dx = info.currentX - info.startX;
        const dy = info.currentY - info.startY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          g.state = 'dragging';
          optionsRef.current.onDragStart?.({ x: info.startX, y: info.startY });
        }
        break;
      }

      case 'dragging': {
        optionsRef.current.onDrag?.(
          { x: info.currentX, y: info.currentY },
          { x: info.currentX - prevX, y: info.currentY - prevY },
        );
        break;
      }

      case 'two-finger': {
        const pair = getPointerPair();
        if (!pair) break;

        const newCenter = pointerCenter(pair[0], pair[1]);
        const newDist = pointerDistance(pair[0], pair[1]);

        // Pan by center movement
        const panDx = newCenter.x - g.lastPinchCenter.x;
        const panDy = newCenter.y - g.lastPinchCenter.y;
        if (panDx !== 0 || panDy !== 0) {
          optionsRef.current.pan(panDx, panDy);
        }

        // Pinch-to-zoom: scale relative to initial distance
        if (g.initialPinchDistance > 0) {
          const scale = newDist / g.initialPinchDistance;
          optionsRef.current.zoomTo(g.startZoom * scale, newCenter);
        }

        g.lastPinchCenter = newCenter;
        break;
      }
      // three-finger: no move processing needed
    }
  }, [getPointerPair]);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    const g = gestureRef.current;
    const info = g.pointers.get(e.pointerId);
    g.pointers.delete(e.pointerId);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may already be released
    }

    if (!info) return;

    switch (g.state) {
      case 'pending':
        optionsRef.current.onTap?.({ x: info.startX, y: info.startY });
        g.state = 'idle';
        break;

      case 'dragging':
        optionsRef.current.onDragEnd?.({ x: info.currentX, y: info.currentY });
        g.state = 'idle';
        break;

      case 'two-finger':
        if (g.pointers.size < 2) {
          if (g.pointers.size === 1) {
            // Reset remaining pointer so it doesn't immediately trigger a drag
            const remaining = Array.from(g.pointers.values())[0]!;
            remaining.startX = remaining.currentX;
            remaining.startY = remaining.currentY;
            g.state = 'pending';
          } else {
            g.state = 'idle';
          }
        }
        break;

      case 'three-finger':
        if (g.pointers.size === 0) {
          if (!g.undoFired) {
            optionsRef.current.undo();
            g.undoFired = true;
          }
          g.state = 'idle';
        }
        break;

      default:
        if (g.pointers.size === 0) g.state = 'idle';
    }
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
