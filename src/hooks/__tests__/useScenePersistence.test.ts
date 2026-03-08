import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScenePersistence } from '../useScenePersistence';
import type { DrawBatch } from '@/types/agent';

const SCENE_KEY = 'whiteboard-scene-v1';
const SNAPSHOTS_KEY = 'whiteboard-snapshots-v1';

// Provide a simple in-memory localStorage for jsdom
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, value); },
  removeItem: (key: string) => { storageMap.delete(key); },
  clear: () => { storageMap.clear(); },
  get length() { return storageMap.size; },
  key: (index: number) => [...storageMap.keys()][index] ?? null,
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

function makeBatch(id: string, elementCount = 1): DrawBatch {
  return {
    batch_id: id,
    elements: Array.from({ length: elementCount }, (_, i) => ({
      id: `${id}-el-${i}`,
      type: 'rect' as const,
      x: 0,
      y: 0,
      w: 100,
      h: 50,
    })),
  };
}

function makeClearBatch(): DrawBatch {
  return {
    batch_id: 'clear-1',
    elements: [{ id: 'c1', type: 'clear' as const }],
  };
}

describe('useScenePersistence', () => {
  beforeEach(() => {
    storageMap.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves batches to localStorage on scene change (debounced)', () => {
    const batches = [makeBatch('b1')];
    const { rerender } = renderHook(
      ({ b }) => useScenePersistence(b),
      { initialProps: { b: batches } },
    );

    // Not saved yet — debounce hasn't fired
    expect(localStorage.getItem(SCENE_KEY)).toBeNull();

    // Advance past debounce
    act(() => { vi.advanceTimersByTime(1100); });
    expect(localStorage.getItem(SCENE_KEY)).not.toBeNull();

    const saved = JSON.parse(localStorage.getItem(SCENE_KEY)!);
    expect(saved).toHaveLength(1);
    expect(saved[0].batch_id).toBe('b1');

    // Update batches triggers new save
    const newBatches = [makeBatch('b1'), makeBatch('b2')];
    rerender({ b: newBatches });
    act(() => { vi.advanceTimersByTime(1100); });

    const saved2 = JSON.parse(localStorage.getItem(SCENE_KEY)!);
    expect(saved2).toHaveLength(2);
  });

  it('does not save clear-only batches', () => {
    const batches = [makeClearBatch()];
    renderHook(() => useScenePersistence(batches));

    act(() => { vi.advanceTimersByTime(1100); });
    expect(localStorage.getItem(SCENE_KEY)).toBeNull();
  });

  it('restores saved scene from localStorage on mount', () => {
    const batches = [makeBatch('saved-1', 3)];
    localStorage.setItem(SCENE_KEY, JSON.stringify(batches));

    const { result } = renderHook(() => useScenePersistence([]));

    expect(result.current.savedSceneExists).toBe(true);
    const restored = result.current.restoreScene();
    expect(restored).toHaveLength(1);
    expect(restored![0].batch_id).toBe('saved-1');
    expect(restored![0].elements).toHaveLength(3);
  });

  it('returns savedSceneExists=false when nothing is saved', () => {
    const { result } = renderHook(() => useScenePersistence([]));
    expect(result.current.savedSceneExists).toBe(false);
    expect(result.current.restoreScene()).toBeNull();
  });

  it('clearSavedScene removes from localStorage', () => {
    localStorage.setItem(SCENE_KEY, JSON.stringify([makeBatch('b1')]));

    const { result } = renderHook(() => useScenePersistence([]));
    expect(result.current.savedSceneExists).toBe(true);

    act(() => { result.current.clearSavedScene(); });
    expect(localStorage.getItem(SCENE_KEY)).toBeNull();
    expect(result.current.savedSceneExists).toBe(false);
  });

  it('saves and lists snapshots', () => {
    const { result } = renderHook(() => useScenePersistence([]));

    act(() => {
      result.current.saveSnapshot([makeBatch('snap-b1')], 'My Snapshot');
    });

    expect(result.current.snapshots).toHaveLength(1);
    expect(result.current.snapshots[0].name).toBe('My Snapshot');

    // Verify persistence
    const stored = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY)!);
    expect(stored).toHaveLength(1);
  });

  it('restores a snapshot by id', () => {
    const { result } = renderHook(() => useScenePersistence([]));

    act(() => {
      result.current.saveSnapshot([makeBatch('snap-r1')], 'Restore Me');
    });

    const id = result.current.snapshots[0].id;
    const restored = result.current.restoreSnapshot(id);
    expect(restored).toHaveLength(1);
    expect(restored![0].batch_id).toBe('snap-r1');
  });

  it('enforces max 5 snapshots', () => {
    const { result } = renderHook(() => useScenePersistence([]));

    act(() => {
      for (let i = 0; i < 7; i++) {
        result.current.saveSnapshot([makeBatch(`snap-${i}`)], `Snapshot ${i}`);
      }
    });

    expect(result.current.snapshots).toHaveLength(5);

    // Most recent should be first (newest-first order)
    expect(result.current.snapshots[0].name).toBe('Snapshot 6');

    // Verify localStorage also capped
    const stored = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY)!);
    expect(stored).toHaveLength(5);
  });

  it('deletes a snapshot', () => {
    const { result } = renderHook(() => useScenePersistence([]));

    act(() => {
      result.current.saveSnapshot([makeBatch('del-1')], 'To Delete');
      result.current.saveSnapshot([makeBatch('keep-1')], 'To Keep');
    });

    expect(result.current.snapshots).toHaveLength(2);

    const deleteId = result.current.snapshots.find((s) => s.name === 'To Delete')!.id;
    act(() => { result.current.deleteSnapshot(deleteId); });

    expect(result.current.snapshots).toHaveLength(1);
    expect(result.current.snapshots[0].name).toBe('To Keep');
  });
});
