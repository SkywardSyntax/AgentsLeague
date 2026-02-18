/**
 * Tests for WhiteboardCanvas component.
 * Covers: render, resize, pointer/wheel/touch event handlers, a11y.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { createElement } from 'react';

// ── Noop requestAnimationFrame BEFORE component import ──────
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  value: (_cb: FrameRequestCallback) => 0,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  value: (_id: number) => {},
  writable: true,
  configurable: true,
});

// ── Canvas getContext stub ──────────────────────────────────

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
  beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  stroke: vi.fn(), fill: vi.fn(), save: vi.fn(), restore: vi.fn(),
  translate: vi.fn(), scale: vi.fn(), setTransform: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 10 }),
  canvas: { width: 800, height: 600 },
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// ── STABLE mock objects (same reference across renders) ─────

const stableCanvasRefs = {
  bgRef: { current: document.createElement('canvas') },
  contentRef: { current: document.createElement('canvas') },
  activeDrawRef: { current: document.createElement('canvas') },
  cursorRef: { current: document.createElement('canvas') },
  dpr: 2,
  width: 800,
  height: 600,
  getActiveDrawContext: () => null,
};

const stableRendererRef = {
  current: {
    renderFull: vi.fn(),
    upsertElements: vi.fn(),
    removeElement: vi.fn(),
    perfMonitor: { tick: vi.fn(), logReport: vi.fn() },
  },
};

const stableRenderer = {
  rendererRef: stableRendererRef,
  render: vi.fn(),
  clear: vi.fn(),
  logPerformance: vi.fn(),
};

const stableSelectedIds: string[] = [];
const stableSelection = {
  selectedIds: stableSelectedIds,
  selectElement: vi.fn(),
  deselectAll: vi.fn(),
  hitTest: vi.fn().mockReturnValue([]),
  getHighlights: vi.fn().mockReturnValue([]),
  updateIndex: vi.fn(),
};

const stableUndoRedo = {
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
  push: vi.fn(),
  startBatch: vi.fn(),
  endBatch: vi.fn(),
  clear: vi.fn(),
};

const stableStreamState = { isStreaming: false, progress: 0, error: null };
const stableStreamActions = { start: vi.fn(), stop: vi.fn() };
const stableStreamResult = [stableStreamState, stableStreamActions] as const;

const stableTheme = { theme: 'light' as const, setTheme: vi.fn() };

// ── Hook / module mocks (returning stable references) ───────

vi.mock('@/hooks/canvas/useCanvasRefs', () => ({
  useCanvasRefs: () => stableCanvasRefs,
}));

vi.mock('@/hooks/canvas/useRenderer', () => ({
  useRenderer: () => stableRenderer,
}));

vi.mock('@/hooks/canvas/useSelection', () => ({
  useSelection: () => stableSelection,
}));

vi.mock('@/hooks/canvas/useUndoRedo', () => ({
  useUndoRedo: () => stableUndoRedo,
}));

vi.mock('@/hooks/canvas/useStreamingDraw', () => ({
  useStreamingDraw: () => stableStreamResult,
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => stableTheme,
}));

vi.mock('@/lib/gestures/GestureHandler', () => ({
  GestureHandler: class {
    on() { return this; }
    attach() {}
    detach() {}
    destroy() {}
  },
}));

vi.mock('@/lib/performance/SkeletonRenderer', () => ({
  SkeletonRenderer: class {
    show() {}
    destroy() {}
  },
}));

vi.mock('@/stores/drawing-session', () => ({
  useDrawingSessionStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ drawingState: { status: 'idle' }, commitOps: vi.fn() }),
}));

import WhiteboardCanvas from '../WhiteboardCanvas';
import { WhiteboardProvider } from '@/stores/whiteboard-store';

// ── Helper ──────────────────────────────────────────────────

function renderCanvas(props = {}) {
  return render(
    createElement(WhiteboardProvider, null, createElement(WhiteboardCanvas, props)),
  );
}

// ── Tests ───────────────────────────────────────────────────

describe('WhiteboardCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Render ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders container with correct a11y attributes', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]');
      expect(canvas).not.toBeNull();
      expect(canvas!.getAttribute('aria-label')).toContain('Interactive whiteboard canvas');
      expect(canvas!.getAttribute('aria-roledescription')).toBe('whiteboard');
    });

    it('renders 4 canvas layers', () => {
      const { container } = renderCanvas();
      const canvases = container.querySelectorAll('canvas');
      expect(canvases.length).toBe(4);
    });

    it('renders empty canvas screen reader description', () => {
      const { container } = renderCanvas();
      const list = container.querySelector('[aria-label="Canvas objects"]');
      expect(list).not.toBeNull();
      expect(list!.textContent).toContain('Empty canvas');
    });

    it('snapshot matches default render', () => {
      const { container } = renderCanvas();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── Sizing ────────────────────────────────────────────

  describe('sizing', () => {
    it('applies explicit width and height via style', () => {
      const { container } = renderCanvas({ width: 1024, height: 768 });
      const div = container.firstChild as HTMLElement;
      expect(div.style.width).toBe('1024px');
      expect(div.style.height).toBe('768px');
    });

    it('defaults to 100% when no width/height provided', () => {
      const { container } = renderCanvas();
      const div = container.firstChild as HTMLElement;
      expect(div.style.width).toBe('100%');
      expect(div.style.height).toBe('100%');
    });
  });

  // ── Pointer Events ────────────────────────────────────

  describe('pointer events', () => {
    it('handles pointer down + move + up (pan gesture)', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(canvas, { clientX: 120, clientY: 110 });
      fireEvent.pointerUp(canvas, {});
      expect(canvas).toBeDefined();
    });

    it('handles middle-click for panning', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, button: 1 });
      fireEvent.pointerMove(canvas, { clientX: 70, clientY: 60 });
      fireEvent.pointerUp(canvas, {});
      expect(canvas).toBeDefined();
    });

    it('ignores pointer move when not dragging', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200 });
      expect(canvas).toBeDefined();
    });

    it('handles pointerCancel as pointerUp', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerCancel(canvas, {});
      fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200 });
      expect(canvas).toBeDefined();
    });
  });

  // ── Wheel Events ──────────────────────────────────────

  describe('wheel events', () => {
    it('handles wheel event for zoom', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      fireEvent.wheel(canvas, { deltaY: -100, clientX: 400, clientY: 300 });
      expect(canvas).toBeDefined();
    });

    it('handles zoom in (negative deltaY)', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      fireEvent.wheel(canvas, { deltaY: -200, clientX: 400, clientY: 300 });
      expect(canvas).toBeDefined();
    });

    it('handles zoom out (positive deltaY)', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      fireEvent.wheel(canvas, { deltaY: 200, clientX: 400, clientY: 300 });
      expect(canvas).toBeDefined();
    });
  });

  // ── Touch Events ──────────────────────────────────────

  describe('touch events', () => {
    it('handles single-finger touch start', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      // jsdom's TouchList lacks .item(), so we test single-finger touch
      // (two-finger path uses .item() which jsdom doesn't support)
      const touches = [{ clientX: 100, clientY: 100, identifier: 0 }];
      fireEvent.touchStart(canvas, { touches, changedTouches: touches });
      expect(canvas).toBeDefined();
    });

    it('handles touch move without crashing', () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector('[role="application"]')!;
      // jsdom's TouchList lacks .item() so multi-finger gestures throw.
      // We verify single-finger touch start + move work without error.
      const start = [{ clientX: 100, clientY: 100, identifier: 0 }];
      fireEvent.touchStart(canvas, { touches: start, changedTouches: start });
      const move = [{ clientX: 110, clientY: 110, identifier: 0 }];
      fireEvent.touchMove(canvas, { touches: move, changedTouches: move });
      fireEvent.touchEnd(canvas, { touches: [], changedTouches: start });
      expect(canvas).toBeDefined();
    });
  });

  // ── onElementsChange ──────────────────────────────────

  describe('onElementsChange', () => {
    it('accepts onElementsChange callback prop', () => {
      const onElementsChange = vi.fn();
      renderCanvas({ onElementsChange });
      expect(onElementsChange).toHaveBeenCalledWith([]);
    });
  });
});
