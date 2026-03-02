import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Tests for canvas dimension guards in WhiteboardCanvas.resizeCanvases.
 *
 * We extract and test the guard logic directly rather than rendering the React
 * component, since the guards are pure arithmetic checks on container dimensions
 * and devicePixelRatio.
 */

// Extracted guard logic matching WhiteboardCanvas.resizeCanvases
function resizeCanvases(
  container: { getBoundingClientRect: () => { width: number; height: number } } | null,
  canvases: Array<{ width: number; height: number; style: { width: string; height: string } } | null>,
  state: { dpr: number; size: { width: number; height: number } },
) {
  if (!container) return false;
  const rect = container.getBoundingClientRect();
  // Guard: skip resize if container has no renderable area
  if (rect.width < 1 || rect.height < 1) return false;
  const nextDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 5));

  state.dpr = nextDpr;
  state.size = { width: rect.width, height: rect.height };

  canvases.forEach((canvas) => {
    if (!canvas) return;
    canvas.width = Math.floor(rect.width * nextDpr);
    canvas.height = Math.floor(rect.height * nextDpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  });

  return true;
}

function makeCanvas() {
  return { width: 100, height: 100, style: { width: '100px', height: '100px' } };
}

function makeContainer(width: number, height: number) {
  return { getBoundingClientRect: () => ({ width, height }) };
}

describe('Canvas Dimension Guards', () => {
  let originalDpr: number;

  beforeEach(() => {
    originalDpr = window.devicePixelRatio;
  });

  afterEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDpr,
      writable: true,
      configurable: true,
    });
  });

  it('skips resize when container width is 0', () => {
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    const result = resizeCanvases(makeContainer(0, 500), [canvas], state);
    expect(result).toBe(false);
    expect(canvas.width).toBe(100); // unchanged
    expect(canvas.height).toBe(100);
  });

  it('skips resize when container height is 0', () => {
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    const result = resizeCanvases(makeContainer(800, 0), [canvas], state);
    expect(result).toBe(false);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(100);
  });

  it('skips resize when both dimensions are 0', () => {
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    const result = resizeCanvases(makeContainer(0, 0), [canvas], state);
    expect(result).toBe(false);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(100);
  });

  it('allows resize when dimensions are valid (800x600)', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true, configurable: true });
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    const result = resizeCanvases(makeContainer(800, 600), [canvas], state);
    expect(result).toBe(true);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.style.width).toBe('800px');
  });

  it('devicePixelRatio of 0 is clamped to 1', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, writable: true, configurable: true });
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    resizeCanvases(makeContainer(400, 300), [canvas], state);
    expect(canvas.width).toBe(400); // 400 * 1
    expect(canvas.height).toBe(300);
    expect(state.dpr).toBe(1);
  });

  it('devicePixelRatio of NaN is clamped to 1', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: NaN, writable: true, configurable: true });
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    resizeCanvases(makeContainer(400, 300), [canvas], state);
    expect(canvas.width).toBe(400); // NaN || 1 => 1
    expect(state.dpr).toBe(1);
  });

  it('devicePixelRatio > 5 is clamped to 5', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 8, writable: true, configurable: true });
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    resizeCanvases(makeContainer(200, 100), [canvas], state);
    expect(canvas.width).toBe(1000); // 200 * 5
    expect(canvas.height).toBe(500); // 100 * 5
    expect(state.dpr).toBe(5);
  });

  it('sub-pixel container dimensions (0.5 x 0.5) are rejected', () => {
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    const result = resizeCanvases(makeContainer(0.5, 0.5), [canvas], state);
    expect(result).toBe(false);
    expect(canvas.width).toBe(100);
  });

  it('negative container dimensions are rejected', () => {
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    const result = resizeCanvases(makeContainer(-100, 300), [canvas], state);
    expect(result).toBe(false);
    expect(canvas.width).toBe(100);
  });

  it('devicePixelRatio undefined (SSR-like env) falls back to 1', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: undefined, writable: true, configurable: true });
    const canvas = makeCanvas();
    const state = { dpr: 1, size: { width: 100, height: 100 } };
    resizeCanvases(makeContainer(500, 400), [canvas], state);
    expect(canvas.width).toBe(500); // 500 * 1
    expect(canvas.height).toBe(400);
    expect(state.dpr).toBe(1);
    expect(state.size).toEqual({ width: 500, height: 400 });
  });
});
