/**
 * Canvas event constants — single source of truth for all event names,
 * default dimensions, zoom limits, and timing thresholds used by the
 * whiteboard canvas subsystem.
 */

// Pointer events
export const POINTER_DOWN = 'pointerdown' as const;
export const POINTER_MOVE = 'pointermove' as const;
export const POINTER_UP = 'pointerup' as const;
export const POINTER_CANCEL = 'pointercancel' as const;

// Keyboard events
export const KEY_DOWN = 'keydown' as const;
export const KEY_UP = 'keyup' as const;

// Scroll/wheel
export const WHEEL = 'wheel' as const;

// Canvas default dimensions
export const DEFAULT_CANVAS_WIDTH = 1600;
export const DEFAULT_CANVAS_HEIGHT = 1200;

// Zoom constraints
export const ZOOM_LIMITS = { min: 0.25, max: 4.0 } as const;

// Timing thresholds (milliseconds)
export const DEBOUNCE_MS = 16;
export const LONG_PRESS_MS = 500;
export const DOUBLE_TAP_MS = 300;

// Pointer thresholds
export const MIN_DRAG_DISTANCE_PX = 3;

export type CanvasPointerEvent =
  | typeof POINTER_DOWN
  | typeof POINTER_MOVE
  | typeof POINTER_UP
  | typeof POINTER_CANCEL;

export type CanvasKeyboardEvent = typeof KEY_DOWN | typeof KEY_UP;
