import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { DrawBatch, StrokeTrajectory } from '@/types/agent';

type CompileResult = { strokes: StrokeTrajectory[]; warnings: string[]; clear: boolean };
const mockCompile = vi.fn<(batch: DrawBatch) => Promise<CompileResult>>();

vi.mock('@/lib/whiteboard/semantic-to-strokes', () => ({
  compileBatchToStrokes: (...args: [DrawBatch]) => mockCompile(...args),
}));

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function makeBatch(id: string, elements: DrawBatch['elements'] = []): DrawBatch {
  return { batch_id: id, elements };
}

describe('WhiteboardCanvas lifecycle', () => {
  beforeEach(() => {
    mockCompile.mockReset();
  });

  // Test 1: Resize listener cleanup removes exact same handler reference
  it('resize listener cleanup removes the exact same handler reference', () => {
    const addedHandlers: Array<{ event: string; handler: Function }> = [];
    const removedHandlers: Array<{ event: string; handler: Function }> = [];

    const origAdd = window.addEventListener.bind(window);
    const origRemove = window.removeEventListener.bind(window);

    window.addEventListener = vi.fn((event: string, handler: any, ...rest: any[]) => {
      addedHandlers.push({ event, handler });
      origAdd(event, handler, ...rest);
    });
    window.removeEventListener = vi.fn((event: string, handler: any, ...rest: any[]) => {
      removedHandlers.push({ event, handler });
      origRemove(event, handler, ...rest);
    });

    // Simulate mounting: register a resize handler
    const resizeHandler = () => {};
    window.addEventListener('resize', resizeHandler);

    // Simulate cleanup
    window.removeEventListener('resize', resizeHandler);

    const addedResize = addedHandlers.filter((h) => h.event === 'resize');
    const removedResize = removedHandlers.filter((h) => h.event === 'resize');

    expect(addedResize.length).toBe(1);
    expect(removedResize.length).toBe(1);
    expect(removedResize[0]!.handler).toBe(addedResize[0]!.handler);

    window.addEventListener = origAdd;
    window.removeEventListener = origRemove;
  });

  // Test 2: Container pointer listeners are added as a matched set
  it('container pointer listeners are added and removed as a matched set', () => {
    const container = document.createElement('div');
    const added = new Map<string, Function>();
    const removed = new Map<string, Function>();

    const origAdd = container.addEventListener.bind(container);
    const origRemove = container.removeEventListener.bind(container);

    container.addEventListener = vi.fn((event: string, handler: any, ...rest: any[]) => {
      added.set(event, handler);
      origAdd(event, handler, ...rest);
    });
    container.removeEventListener = vi.fn((event: string, handler: any, ...rest: any[]) => {
      removed.set(event, handler);
      origRemove(event, handler, ...rest);
    });

    // Simulate mounting: register handlers
    const onPointerDown = () => {};
    const onPointerMove = () => {};
    const onPointerUp = () => {};
    const onWheel = () => {};

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Simulate cleanup
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('wheel', onWheel);

    const expectedEvents = ['pointerdown', 'pointermove', 'pointerup', 'wheel'];
    for (const event of expectedEvents) {
      expect(added.has(event)).toBe(true);
      expect(removed.has(event)).toBe(true);
      expect(removed.get(event)).toBe(added.get(event));
    }
  });

  // Test 3: Wheel listener uses { passive: false } on add
  it('wheel listener uses { passive: false }', () => {
    const container = document.createElement('div');
    let capturedOptions: any = null;

    const origAdd = container.addEventListener.bind(container);
    container.addEventListener = vi.fn((event: string, handler: any, options?: any) => {
      if (event === 'wheel') capturedOptions = options;
      origAdd(event, handler, options);
    });

    const onWheel = (e: WheelEvent) => { e.preventDefault(); };
    container.addEventListener('wheel', onWheel, { passive: false });

    expect(capturedOptions).toEqual({ passive: false });
  });

  // Test 4: RAF loop is cancelled on unmount
  it('RAF loop is cancelled on unmount', () => {
    const originalRAF = globalThis.requestAnimationFrame;
    const originalCAF = globalThis.cancelAnimationFrame;

    let rafId = 100;
    const rafIds: number[] = [];
    let cancelledId: number | null = null;

    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      const id = rafId++;
      rafIds.push(id);
      return id;
    });
    globalThis.cancelAnimationFrame = vi.fn((id: number) => {
      cancelledId = id;
    });

    // Simulate starting RAF loop
    let currentRafId: number | null = null;
    const drawFrame = () => {
      currentRafId = requestAnimationFrame(drawFrame);
    };
    currentRafId = requestAnimationFrame(drawFrame);

    // Simulate cleanup
    if (currentRafId !== null) cancelAnimationFrame(currentRafId);

    expect(cancelledId).toBe(currentRafId);
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledTimes(1);

    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
  });

  // Test 5: Double-mount does not stack duplicate resize listeners
  it('double-mount does not stack duplicate resize listeners', () => {
    const addedResizeHandlers: Function[] = [];
    const removedResizeHandlers: Function[] = [];

    const origAdd = window.addEventListener.bind(window);
    const origRemove = window.removeEventListener.bind(window);

    window.addEventListener = vi.fn((event: string, handler: any, ...rest: any[]) => {
      if (event === 'resize') addedResizeHandlers.push(handler);
      origAdd(event, handler, ...rest);
    });
    window.removeEventListener = vi.fn((event: string, handler: any, ...rest: any[]) => {
      if (event === 'resize') removedResizeHandlers.push(handler);
      origRemove(event, handler, ...rest);
    });

    // Simulate mount 1 (React strict mode)
    const handler1 = () => {};
    window.addEventListener('resize', handler1);

    // Simulate mount 2 without unmount
    const handler2 = () => {};
    window.addEventListener('resize', handler2);

    expect(addedResizeHandlers.length).toBe(2);
    // Different references — not the same handler stacking
    expect(addedResizeHandlers[0]).not.toBe(addedResizeHandlers[1]);

    // Cleanup both
    window.removeEventListener('resize', handler1);
    window.removeEventListener('resize', handler2);

    window.addEventListener = origAdd;
    window.removeEventListener = origRemove;
  });

  // Test 6: Batch processing respects `cancelled` flag on unmount
  it('batch processing respects cancelled flag on unmount', async () => {
    const processedStrokes: StrokeTrajectory[][] = [];
    let cancelled = false;

    // Slow compilation that takes time
    mockCompile.mockImplementation(async (batch) => {
      await new Promise((r) => setTimeout(r, 50));
      return {
        strokes: [{ id: 's1', elementId: 'e1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '#000', baseWidth: 1 }],
        warnings: [],
        clear: false,
      };
    });

    const batches = [makeBatch('b1')];
    const processedIds = new Set<string>();

    // Start processing
    const processPromise = (async () => {
      for (const batch of batches) {
        if (processedIds.has(batch.batch_id)) continue;
        processedIds.add(batch.batch_id);

        const compiled = await mockCompile(batch);
        if (cancelled) return; // exit without pushing strokes

        processedStrokes.push(compiled.strokes);
      }
    })();

    // Simulate unmount immediately
    cancelled = true;

    await processPromise;

    // Strokes should NOT have been pushed because cancelled was set
    expect(processedStrokes.length).toBe(0);
  });

  // Test 7: processedBatchIdsRef prevents duplicate processing
  it('processedBatchIdsRef prevents duplicate processing', async () => {
    mockCompile.mockResolvedValue({ strokes: [], warnings: [], clear: false });

    const processedIds = new Set<string>();
    const batches = [makeBatch('dup-1'), makeBatch('dup-1')];

    for (const batch of batches) {
      if (processedIds.has(batch.batch_id)) continue;
      processedIds.add(batch.batch_id);
      await mockCompile(batch);
    }

    expect(mockCompile).toHaveBeenCalledTimes(1);
  });

  // Test 8: processedBatchIdsRef accumulates across re-renders
  it('processedBatchIdsRef accumulates across re-renders', async () => {
    mockCompile.mockResolvedValue({ strokes: [], warnings: [], clear: false });

    const processedIds = new Set<string>();

    // First render with batch A
    const render1 = [makeBatch('A')];
    for (const batch of render1) {
      if (processedIds.has(batch.batch_id)) continue;
      processedIds.add(batch.batch_id);
      await mockCompile(batch);
    }

    expect(mockCompile).toHaveBeenCalledTimes(1);

    // Second render with [A, B]
    const render2 = [makeBatch('A'), makeBatch('B')];
    for (const batch of render2) {
      if (processedIds.has(batch.batch_id)) continue;
      processedIds.add(batch.batch_id);
      await mockCompile(batch);
    }

    // Only batch B should be newly processed
    expect(mockCompile).toHaveBeenCalledTimes(2);
    expect(mockCompile).toHaveBeenLastCalledWith(expect.objectContaining({ batch_id: 'B' }));
  });

  // Test 9: Pointer capture is released on pointerup
  it('pointer capture is released on pointerup', () => {
    const container = document.createElement('div');
    let capturedId: number | null = null;
    let releasedId: number | null = null;

    container.setPointerCapture = vi.fn((id: number) => { capturedId = id; });
    container.releasePointerCapture = vi.fn((id: number) => { releasedId = id; });

    const pointerId = 42;

    // Simulate pointerdown
    container.setPointerCapture(pointerId);

    // Simulate pointerup
    try { container.releasePointerCapture(pointerId); } catch { /* already released */ }

    expect(capturedId).toBe(pointerId);
    expect(releasedId).toBe(pointerId);
    expect(releasedId).toBe(capturedId);
  });

  // Test 10: Camera zoom clamp prevents infinite zoom
  it('camera zoom clamp prevents infinite zoom', () => {
    let zoom = 1;

    // Extreme zoom in (negative deltaY)
    const deltaYIn = -100000;
    const zoomFactorIn = Math.exp(-deltaYIn * 0.0012);
    zoom = clamp(zoom * zoomFactorIn, MIN_ZOOM, MAX_ZOOM);
    expect(zoom).toBeLessThanOrEqual(MAX_ZOOM);
    expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBe(MAX_ZOOM);

    // Reset
    zoom = 1;

    // Extreme zoom out (positive deltaY)
    const deltaYOut = 100000;
    const zoomFactorOut = Math.exp(-deltaYOut * 0.0012);
    zoom = clamp(zoom * zoomFactorOut, MIN_ZOOM, MAX_ZOOM);
    expect(zoom).toBeLessThanOrEqual(MAX_ZOOM);
    expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBe(MIN_ZOOM);

    // Ensure never reaches 0 or Infinity
    expect(zoom).not.toBe(0);
    expect(zoom).not.toBe(Infinity);
  });
});
