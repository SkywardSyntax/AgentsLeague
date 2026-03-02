import { describe, it, expect } from 'vitest';
import {
  POINTER_DOWN,
  POINTER_MOVE,
  POINTER_UP,
  WHEEL,
  KEY_DOWN,
  KEY_UP,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  ZOOM_LIMITS,
  DEBOUNCE_MS,
  LONG_PRESS_MS,
  DOUBLE_TAP_MS,
  POINTER_CANCEL,
  MIN_DRAG_DISTANCE_PX,
} from '../canvas-events';

describe('Lane 01 — Canvas Event Constants', () => {
  it('POINTER_DOWN equals "pointerdown"', () => {
    expect(POINTER_DOWN).toBe('pointerdown');
  });

  it('POINTER_MOVE equals "pointermove"', () => {
    expect(POINTER_MOVE).toBe('pointermove');
  });

  it('POINTER_UP equals "pointerup"', () => {
    expect(POINTER_UP).toBe('pointerup');
  });

  it('WHEEL equals "wheel"', () => {
    expect(WHEEL).toBe('wheel');
  });

  it('KEY_DOWN equals "keydown"', () => {
    expect(KEY_DOWN).toBe('keydown');
  });

  it('KEY_UP equals "keyup"', () => {
    expect(KEY_UP).toBe('keyup');
  });

  it('DEFAULT_CANVAS_WIDTH is 1600', () => {
    expect(DEFAULT_CANVAS_WIDTH).toBe(1600);
  });

  it('DEFAULT_CANVAS_HEIGHT is 1200', () => {
    expect(DEFAULT_CANVAS_HEIGHT).toBe(1200);
  });

  it('ZOOM_LIMITS has min=0.25 and max=4.0', () => {
    expect(ZOOM_LIMITS).toEqual({ min: 0.25, max: 4.0 });
  });

  it('DEBOUNCE_MS is a positive integer', () => {
    expect(DEBOUNCE_MS).toBeGreaterThan(0);
    expect(Number.isInteger(DEBOUNCE_MS)).toBe(true);
  });
});
