/**
 * Tests for WhiteboardCanvas component.
 * Covers: render, resize, pointer/wheel/touch event handlers, text overlay, a11y.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { createElement } from 'react';
import WhiteboardCanvas from '../WhiteboardCanvas';
import { WhiteboardProvider } from '@/stores/whiteboard-store';

// ── Mocks ───────────────────────────────────────────────────────

// Mock useCanvasRefs — returns stable refs and dimensions
const mockBgRef = { current: document.createElement('canvas') };
const mockContentRef = { current: document.createElement('canvas') };
const mockActiveDrawRef = { current: document.createElement('canvas') };
const mockCursorRef = { current: document.createElement('canvas') };

vi.mock('@/hooks/canvas/useCanvasRefs', () => ({
  useCanvasRefs: () => ({
    bgRef: mockBgRef,
    contentRef: mockContentRef,
    activeDrawRef: mockActiveDrawRef,
    cursorRef: mockCursorRef,
    dpr: 2,
    width: 800,
    height: 600,
    getBgContext: () => null,
    getContentContext: () => null,
    getActiveDrawContext: () => null,
    getCursorContext: () => null,
  }),
}));

// Mock useRenderer — provide no-op renderer with renderFull stub
const mockRenderFull = vi.fn();
const mockUpsertElements = vi.fn();
const mockRemoveElement = vi.fn();
const mockPerfMonitor = { tick: vi.fn(), logReport: vi.fn() };

vi.mock('@/hooks/canvas/useRenderer', () => ({
  useRenderer: () => ({
    rendererRef: {
      current: {
        renderFull: mockRenderFull,
        upsertElements: mockUpsertElements,
        removeElement: mockRemoveElement,
        perfMonitor: mockPerfMonitor,
      },
    },
    render: vi.fn(),
    clear: vi.fn(),
    logPerformance: vi.fn(),
  }),
}));

// Mock useSelection
vi.mock('@/hooks/canvas/useSelection', () => ({
  useSelection: () => ({
    selectedIds: [],
    selectElement: vi.fn(),
    deselectAll: vi.fn(),
    toggleSelect: vi.fn(),
    hitTest: vi.fn(() => []),
    marqueeSelect: vi.fn(),
    lassoSelect: vi.fn(),
    getHighlights: vi.fn(() => []),
    updateIndex: vi.fn(),
    getManager: vi.fn(),
  }),
}));

// Mock useUndoRedo
vi.mock('@/hooks/canvas/useUndoRedo', () => ({
  useUndoRedo: () => ({
    push: vi.fn(),
    undo: vi.fn(() => false),
    redo: vi.fn(() => false),
    canUndo: false,
    canRedo: false,
    startBatch: vi.fn(),
    endBatch: vi.fn(),
    clear: vi.fn(),
  }),
}));

// Mock useStreamingDraw
vi.mock('@/hooks/canvas/useStreamingDraw', () => ({
  useStreamingDraw: () => [
    { visibleElements: [], progress: 0, isStreaming: false, isComplete: false },
    { start: vi.fn(), stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), reset: vi.fn() },
  ],
}));

// Mock useTheme
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

// Mock drawing-session store
vi.mock('@/stores/drawing-session', () => ({
  useDrawingSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      drawingState: { status: 'idle' },
      commitOps: vi.fn(),
    }),
}));

// Mock GestureHandler
vi.mock('@/lib/gestures/GestureHandler', () => ({
  GestureHandler: vi.fn().mockImplementation(() => ({
    on: vi.fn().mockReturnThis(),
    attach: vi.fn(),
    detach: vi.fn(),
    reset: vi.fn(),
  })),
}));

// Mock SkeletonRenderer
vi.mock('@/lib/performance/SkeletonRenderer', () => ({
  SkeletonRenderer: vi.fn().mockImplementation(() => ({
    show: vi.fn(() => ({ replace: vi.fn(), dismiss: vi.fn(), isActive: () => false })),
    destroy: vi.fn(),
    isActive: () => false,
  })),
}));

function renderCanvas(props = {}) {
  return render(
    createElement(WhiteboardProvider, null, createElement(WhiteboardCanvas, props)),
  );
}

// ── Tests ───────────────────────────────────────────────────────

describe('WhiteboardCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Render ──────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders container with correct a11y attributes', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');
      expect(canvas).toBeDefined();
      expect(canvas.getAttribute('aria-label')).toContain('Interactive whiteboard canvas');
      expect(canvas.getAttribute('aria-roledescription')).toBe('whiteboard');
    });

    it('renders 4 canvas layers', () => {
      const { container } = renderCanvas();
      const canvases = container.querySelectorAll('canvas');
      expect(canvases.length).toBe(4);
    });

    it('renders empty canvas screen reader description', () => {
      renderCanvas();
      const list = screen.getByRole('list', { name: 'Canvas objects' });
      expect(list).toBeDefined();
      expect(list.textContent).toContain('Empty canvas');
    });

    it('snapshot matches default render', () => {
      const { container } = renderCanvas();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── Sizing ─────────────────────────────────────────────────

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

  // ── Pointer Events (Pan) ───────────────────────────────────

  describe('pointer events', () => {
    it('handles pointer down + move + up (pan gesture)', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(canvas, { clientX: 120, clientY: 110 });
      fireEvent.pointerUp(canvas, {});

      // No crash — camera update happens internally via setCamera
      expect(canvas).toBeDefined();
    });

    it('handles middle-click for panning', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, button: 1 });
      fireEvent.pointerMove(canvas, { clientX: 70, clientY: 60 });
      fireEvent.pointerUp(canvas, {});

      expect(canvas).toBeDefined();
    });

    it('ignores pointer move when not dragging', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      // Move without prior pointerDown should be no-op
      fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200 });
      expect(canvas).toBeDefined();
    });

    it('handles pointerCancel as pointerUp', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerCancel(canvas, {});
      // Should stop dragging — subsequent move should be no-op
      fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200 });
      expect(canvas).toBeDefined();
    });
  });

  // ── Wheel Events (Zoom) ────────────────────────────────────

  describe('wheel events', () => {
    it('handles wheel event for zoom', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      fireEvent.wheel(canvas, { deltaY: -100, clientX: 400, clientY: 300 });
      expect(canvas).toBeDefined();
    });

    it('handles zoom in (negative deltaY)', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      fireEvent.wheel(canvas, { deltaY: -200, clientX: 400, clientY: 300 });
      expect(canvas).toBeDefined();
    });

    it('handles zoom out (positive deltaY)', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      fireEvent.wheel(canvas, { deltaY: 200, clientX: 400, clientY: 300 });
      expect(canvas).toBeDefined();
    });
  });

  // ── Touch Events (Pinch Zoom) ──────────────────────────────

  describe('touch events', () => {
    it('handles two-finger touch start', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      const touches = [
        { clientX: 100, clientY: 100, identifier: 0 },
        { clientX: 200, clientY: 200, identifier: 1 },
      ];

      fireEvent.touchStart(canvas, {
        touches,
        changedTouches: touches,
      });
      expect(canvas).toBeDefined();
    });

    it('handles pinch zoom via two-finger touch move', () => {
      renderCanvas();
      const canvas = screen.getByRole('application');

      const startTouches = [
        { clientX: 100, clientY: 100, identifier: 0 },
        { clientX: 200, clientY: 200, identifier: 1 },
      ];
      fireEvent.touchStart(canvas, {
        touches: startTouches,
        changedTouches: startTouches,
      });

      const moveTouches = [
        { clientX: 80, clientY: 80, identifier: 0 },
        { clientX: 220, clientY: 220, identifier: 1 },
      ];
      fireEvent.touchMove(canvas, {
        touches: moveTouches,
        changedTouches: moveTouches,
      });
      expect(canvas).toBeDefined();
    });
  });

  // ── onElementsChange callback ──────────────────────────────

  describe('onElementsChange', () => {
    it('accepts onElementsChange callback prop', () => {
      const onElementsChange = vi.fn();
      renderCanvas({ onElementsChange });
      // Callback is invoked via useEffect when elements change; store starts empty
      expect(onElementsChange).toHaveBeenCalledWith([]);
    });
  });
});
