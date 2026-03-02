import type { DrawElement } from '@/types/agent';

export const COORD_BOUNDS = {
  MIN_X: -2000,
  MAX_X: 4000,
  MIN_Y: -2000,
  MAX_Y: 4000,
  MIN_DIMENSION: 1,
  MAX_DIMENSION: 3000,
} as const;

function clampCoord(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  if (!Number.isFinite(v)) return v > 0 ? max : min;
  return Math.min(max, Math.max(min, v));
}

export function clampElementCoordinates(el: DrawElement): DrawElement {
  if (el.type === 'rect') {
    return {
      ...el,
      x: clampCoord(el.x, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X),
      y: clampCoord(el.y, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y),
      w: clampCoord(el.w, COORD_BOUNDS.MIN_DIMENSION, COORD_BOUNDS.MAX_DIMENSION),
      h: clampCoord(el.h, COORD_BOUNDS.MIN_DIMENSION, COORD_BOUNDS.MAX_DIMENSION),
    };
  }
  if (el.type === 'ellipse') {
    return {
      ...el,
      cx: clampCoord(el.cx, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X),
      cy: clampCoord(el.cy, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y),
      rx: clampCoord(el.rx, COORD_BOUNDS.MIN_DIMENSION, COORD_BOUNDS.MAX_DIMENSION),
      ry: clampCoord(el.ry, COORD_BOUNDS.MIN_DIMENSION, COORD_BOUNDS.MAX_DIMENSION),
    };
  }
  if (el.type === 'line' || el.type === 'arrow') {
    return {
      ...el,
      from: {
        x: clampCoord(el.from.x, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X),
        y: clampCoord(el.from.y, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y),
      },
      to: {
        x: clampCoord(el.to.x, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X),
        y: clampCoord(el.to.y, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y),
      },
    };
  }
  if (el.type === 'text') {
    return {
      ...el,
      x: clampCoord(el.x, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X),
      y: clampCoord(el.y, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y),
    };
  }
  if (el.type === 'latex') {
    return {
      ...el,
      x: clampCoord(el.x, COORD_BOUNDS.MIN_X, COORD_BOUNDS.MAX_X),
      y: clampCoord(el.y, COORD_BOUNDS.MIN_Y, COORD_BOUNDS.MAX_Y),
    };
  }
  return el;
}

export function clampBatchCoordinates(elements: DrawElement[]): DrawElement[] {
  return elements.map(clampElementCoordinates);
}
