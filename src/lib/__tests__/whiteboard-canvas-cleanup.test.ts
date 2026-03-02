import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';

/* ---------- stub canvas 2d context ---------- */
const stubCtx = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  set fillStyle(_v: string) {},
  set strokeStyle(_v: string) {},
  set lineCap(_v: string) {},
  set lineJoin(_v: string) {},
  set lineWidth(_v: number) {},
};

const getContextSpy = vi
  .spyOn(HTMLCanvasElement.prototype, 'getContext')
  .mockReturnValue(stubCtx as unknown as RenderingContext);

/* ---------- mock heavy dependencies so the component renders cheaply ---------- */
vi.mock('@/lib/whiteboard/semantic-to-strokes', () => ({
  compileBatchToStrokes: vi.fn().mockResolvedValue({
    strokes: [],
    warnings: [],
    clear: false,
  }),
}));

vi.mock('@/lib/whiteboard/stroke-scheduler', () => ({
  createActiveBatch: vi.fn().mockReturnValue([]),
  easeOutCubic: (t: number) => t,
}));

vi.mock('@/lib/whiteboard/layout-spacing', () => ({
  normalizeBatchTextSpacingAgainstScene: vi.fn(),
}));

vi.mock('@/lib/whiteboard/geometry', () => ({
  partialPolylineByLength: vi.fn().mockReturnValue([]),
  screenStrokePx: vi.fn().mockReturnValue(1),
}));

// Import after mocks
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WhiteboardCanvas } = await import(
  '@/components/whiteboard/WhiteboardCanvas'
);

describe('WhiteboardCanvas cleanup on unmount', () => {
  let cancelSpy: ReturnType<typeof vi.spyOn>;
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    // re-apply getContext stub after restoreAllMocks
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      stubCtx as unknown as RenderingContext,
    );
  });

  it('calls cancelAnimationFrame on unmount', async () => {
    const { unmount } = render(
      React.createElement(WhiteboardCanvas, {
        batches: [],
        onWarning: vi.fn(),
      }),
    );
    // let at least one RAF fire
    await act(() => new Promise((r) => setTimeout(r, 50)));
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('removes resize listener on unmount', async () => {
    const { unmount } = render(
      React.createElement(WhiteboardCanvas, {
        batches: [],
        onWarning: vi.fn(),
      }),
    );
    await act(() => new Promise((r) => setTimeout(r, 20)));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('batch processing cancelled flag prevents stale updates after unmount', async () => {
    const { compileBatchToStrokes } = await import(
      '@/lib/whiteboard/semantic-to-strokes'
    );
    const compileMock = vi.mocked(compileBatchToStrokes);

    // Make compile slow so it resolves after unmount
    let resolveCompile!: () => void;
    compileMock.mockReturnValueOnce(
      new Promise<Awaited<ReturnType<typeof compileBatchToStrokes>>>((r) => {
        resolveCompile = () =>
          r({ strokes: [], warnings: [], clear: false });
      }),
    );

    const consoleErrorSpy = vi.spyOn(console, 'error');

    const batch = { batch_id: 'b1', elements: [] };
    const { unmount } = render(
      React.createElement(WhiteboardCanvas, {
        batches: [batch],
        onWarning: vi.fn(),
      }),
    );

    // Unmount before compile resolves
    unmount();

    // Now resolve compile — the cancelled flag should prevent mutations
    resolveCompile();
    await act(() => new Promise((r) => setTimeout(r, 50)));

    // No console errors from React about setting state on unmounted component
    const reactErrors = consoleErrorSpy.mock.calls.filter(
      (c) =>
        typeof c[0] === 'string' &&
        c[0].includes('unmounted'),
    );
    expect(reactErrors).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });

  it('no new RAF scheduled after unmount', async () => {
    const { unmount } = render(
      React.createElement(WhiteboardCanvas, {
        batches: [],
        onWarning: vi.fn(),
      }),
    );
    await act(() => new Promise((r) => setTimeout(r, 50)));

    unmount();
    expect(cancelSpy).toHaveBeenCalled();

    // Record RAF call count right after unmount
    const countAfterUnmount = rafSpy.mock.calls.length;

    // Wait and verify no new RAF calls are made
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(rafSpy.mock.calls.length).toBe(countAfterUnmount);
  });
});
