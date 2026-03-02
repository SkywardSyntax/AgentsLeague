import { describe, it, expect } from 'vitest';
import {
  computeFps,
  formatFps,
  isDebugShortcut,
  toggleDebugOverlay,
  createDrawCallCounter,
} from '../whiteboard/canvas-debug';

describe('Canvas Debug Overlay', () => {
  describe('computeFps', () => {
    it('computes correct average from 60 samples', () => {
      const deltas = Array(60).fill(16.67);
      const fps = computeFps(deltas);
      expect(fps).toBeCloseTo(60, 0);
    });

    it('returns 0 when ring buffer is empty', () => {
      expect(computeFps([])).toBe(0);
    });

    it('ignores outlier frames (>200ms) to avoid skewing', () => {
      const deltas = [...Array(59).fill(16.67), 500];
      const fps = computeFps(deltas);
      expect(fps).toBeCloseTo(60, 0);
    });
  });

  describe('createDrawCallCounter', () => {
    it('resets to 0 each frame', () => {
      const counter = createDrawCallCounter();
      counter.increment();
      counter.increment();
      expect(counter.read()).toBe(2);
      counter.reset();
      expect(counter.read()).toBe(0);
    });

    it('increments correctly across multiple strokes', () => {
      const counter = createDrawCallCounter();
      for (let s = 0; s < 10; s++) {
        for (let seg = 0; seg < 5; seg++) {
          counter.increment();
        }
      }
      expect(counter.read()).toBe(50);
    });
  });

  describe('toggleDebugOverlay', () => {
    it('flips boolean correctly', () => {
      const ref = { current: false };
      expect(toggleDebugOverlay(ref)).toBe(true);
      expect(ref.current).toBe(true);
      expect(toggleDebugOverlay(ref)).toBe(false);
      expect(ref.current).toBe(false);
    });
  });

  describe('isDebugShortcut', () => {
    it('recognises Ctrl+Shift+D', () => {
      expect(isDebugShortcut({ ctrlKey: true, shiftKey: true, key: 'D' })).toBe(true);
    });

    it('rejects partial matches (Ctrl+D without Shift)', () => {
      expect(isDebugShortcut({ ctrlKey: true, shiftKey: false, key: 'D' })).toBe(false);
    });

    it('rejects partial matches (Shift+D without Ctrl)', () => {
      expect(isDebugShortcut({ ctrlKey: false, shiftKey: true, key: 'D' })).toBe(false);
    });

    it('is case-insensitive (d vs D)', () => {
      expect(isDebugShortcut({ ctrlKey: true, shiftKey: true, key: 'd' })).toBe(true);
      expect(isDebugShortcut({ ctrlKey: true, shiftKey: true, key: 'D' })).toBe(true);
    });
  });

  describe('formatFps', () => {
    it('truncates FPS to 1 decimal place', () => {
      expect(formatFps(59.847)).toBe('59.8');
      expect(formatFps(0)).toBe('0.0');
      expect(formatFps(120.06)).toBe('120.1');
    });
  });
});
