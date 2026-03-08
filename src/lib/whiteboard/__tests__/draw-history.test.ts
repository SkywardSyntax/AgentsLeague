import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDrawHistory } from '@/hooks/useDrawHistory';
import type { DrawBatch } from '@/types/agent';

/** Helper to create a minimal DrawBatch. */
function makeBatch(id: string): DrawBatch {
  return {
    batch_id: id,
    elements: [
      { id: `el-${id}`, type: 'line' as const, from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
    ],
  };
}

describe('useDrawHistory', () => {
  it('starts with empty undo/redo stacks', () => {
    const { result } = renderHook(() => useDrawHistory('chat-1', []));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('pushState enables undo', () => {
    const { result } = renderHook(() => useDrawHistory('chat-1', [makeBatch('a')]));

    act(() => result.current.pushState([makeBatch('a')]));

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo returns the previous state and enables redo', () => {
    const initial: DrawBatch[] = [];
    const afterDraw: DrawBatch[] = [makeBatch('a')];

    const { result, rerender } = renderHook(
      ({ batches }) => useDrawHistory('chat-1', batches),
      { initialProps: { batches: initial } },
    );

    // Simulate: push snapshot of empty state, then "draw" batch a
    act(() => result.current.pushState(initial));
    rerender({ batches: afterDraw });

    // Undo should return the empty state
    let undone: DrawBatch[] | null = null;
    act(() => {
      undone = result.current.undo();
    });

    expect(undone).toEqual(initial);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo returns the state that was undone', () => {
    const initial: DrawBatch[] = [];
    const afterDraw: DrawBatch[] = [makeBatch('a')];

    const { result, rerender } = renderHook(
      ({ batches }) => useDrawHistory('chat-1', batches),
      { initialProps: { batches: initial } },
    );

    act(() => result.current.pushState(initial));
    rerender({ batches: afterDraw });

    // Undo, then simulate the app restoring the empty state
    act(() => {
      result.current.undo();
    });
    rerender({ batches: initial });

    // Redo should return afterDraw
    let redone: DrawBatch[] | null = null;
    act(() => {
      redone = result.current.redo();
    });

    expect(redone).toEqual(afterDraw);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it('undo on empty stack returns null', () => {
    const { result } = renderHook(() => useDrawHistory('chat-1', []));
    let undone: DrawBatch[] | null = 'not-null' as unknown as DrawBatch[] | null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBeNull();
  });

  it('redo on empty stack returns null', () => {
    const { result } = renderHook(() => useDrawHistory('chat-1', []));
    let redone: DrawBatch[] | null = 'not-null' as unknown as DrawBatch[] | null;
    act(() => {
      redone = result.current.redo();
    });
    expect(redone).toBeNull();
  });

  it('pushState after undo clears the redo stack', () => {
    const { result, rerender } = renderHook(
      ({ batches }) => useDrawHistory('chat-1', batches),
      { initialProps: { batches: [] as DrawBatch[] } },
    );

    act(() => result.current.pushState([]));
    rerender({ batches: [makeBatch('a')] });

    act(() => {
      result.current.undo();
    });
    rerender({ batches: [] });

    expect(result.current.canRedo).toBe(true);

    // New push should discard redo
    act(() => result.current.pushState([]));
    expect(result.current.canRedo).toBe(false);
  });

  it('clear() resets all history for the chat', () => {
    const { result } = renderHook(() => useDrawHistory('chat-1', []));

    act(() => result.current.pushState([]));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('caps past stack at 50 entries', () => {
    const { result } = renderHook(() => useDrawHistory('chat-1', []));

    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.pushState([makeBatch(`batch-${i}`)]);
      }
    });

    // Undo 50 times should work
    let undoCount = 0;
    act(() => {
      while (result.current.undo() !== null) {
        undoCount++;
      }
    });

    expect(undoCount).toBe(50);
  });

  it('caps past stack at 50 during redo as well', () => {
    const { result, rerender } = renderHook(
      ({ batches }) => useDrawHistory('chat-1', batches),
      { initialProps: { batches: [] as DrawBatch[] } },
    );

    // Fill history to 50
    act(() => {
      for (let i = 0; i < 50; i++) {
        result.current.pushState([makeBatch(`batch-${i}`)]);
      }
    });

    // Undo one, redo it — past should still be capped at 50
    act(() => {
      result.current.undo();
    });
    rerender({ batches: [] });
    act(() => {
      result.current.redo();
    });

    let undoCount = 0;
    act(() => {
      while (result.current.undo() !== null) {
        undoCount++;
      }
    });

    expect(undoCount).toBeLessThanOrEqual(50);
  });

  it('maintains separate history per chatId', () => {
    const { result: r1 } = renderHook(() => useDrawHistory('chat-A', []));
    const { result: r2 } = renderHook(() => useDrawHistory('chat-B', []));

    act(() => r1.current.pushState([]));

    expect(r1.current.canUndo).toBe(true);
    expect(r2.current.canUndo).toBe(false);
  });

  it('multi-step undo/redo round-trip preserves data', () => {
    const step0: DrawBatch[] = [];
    const step1: DrawBatch[] = [makeBatch('a')];
    const step2: DrawBatch[] = [makeBatch('a'), makeBatch('b')];

    const { result, rerender } = renderHook(
      ({ batches }) => useDrawHistory('chat-1', batches),
      { initialProps: { batches: step0 } },
    );

    // Push step0, then draw step1
    act(() => result.current.pushState(step0));
    rerender({ batches: step1 });

    // Push step1, then draw step2
    act(() => result.current.pushState(step1));
    rerender({ batches: step2 });

    // Undo to step1
    let undone: DrawBatch[] | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toEqual(step1);
    rerender({ batches: step1 });

    // Undo to step0
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toEqual(step0);
    rerender({ batches: step0 });

    // Redo to step1
    let redone: DrawBatch[] | null = null;
    act(() => {
      redone = result.current.redo();
    });
    expect(redone).toEqual(step1);
    rerender({ batches: step1 });

    // Redo to step2
    act(() => {
      redone = result.current.redo();
    });
    expect(redone).toEqual(step2);
  });
});
