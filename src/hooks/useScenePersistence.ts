'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawBatch } from '@/types/agent';

const SCENE_KEY = 'whiteboard-scene-v1';
const SNAPSHOTS_KEY = 'whiteboard-snapshots-v1';
const MAX_SNAPSHOTS = 5;
const SAVE_DEBOUNCE_MS = 1000;

export interface SceneSnapshot {
  id: string;
  name: string;
  timestamp: number;
  batches: DrawBatch[];
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota exceeded or unavailable — silently ignore
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function loadBatchesFromStorage(): DrawBatch[] | null {
  const raw = safeGetItem(SCENE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as DrawBatch[];
  } catch {
    // corrupt data
  }
  return null;
}

function loadSnapshots(): SceneSnapshot[] {
  const raw = safeGetItem(SNAPSHOTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SceneSnapshot[];
  } catch {
    // corrupt data
  }
  return [];
}

function saveSnapshots(snapshots: SceneSnapshot[]): void {
  safeSetItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

export interface UseScenePersistenceResult {
  savedSceneExists: boolean;
  restoreScene: () => DrawBatch[] | null;
  clearSavedScene: () => void;
  snapshots: SceneSnapshot[];
  saveSnapshot: (batches: DrawBatch[], name?: string) => void;
  restoreSnapshot: (id: string) => DrawBatch[] | null;
  deleteSnapshot: (id: string) => void;
}

export function useScenePersistence(batches: DrawBatch[]): UseScenePersistenceResult {
  const [savedSceneExists, setSavedSceneExists] = useState(false);
  const [snapshots, setSnapshots] = useState<SceneSnapshot[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for saved scene and load snapshots on mount
  useEffect(() => {
    setSavedSceneExists(loadBatchesFromStorage() !== null);
    setSnapshots(loadSnapshots());
  }, []);

  // Debounced auto-save on batches change
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    // Only save if there are meaningful batches (not just a clear)
    const hasContent = batches.length > 0 &&
      batches.some((b) => b.elements.some((el) => el.type !== 'clear'));

    saveTimerRef.current = setTimeout(() => {
      if (hasContent) {
        safeSetItem(SCENE_KEY, JSON.stringify(batches));
        setSavedSceneExists(true);
      } else {
        safeRemoveItem(SCENE_KEY);
        setSavedSceneExists(false);
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [batches]);

  const restoreScene = useCallback((): DrawBatch[] | null => {
    return loadBatchesFromStorage();
  }, []);

  const clearSavedScene = useCallback(() => {
    safeRemoveItem(SCENE_KEY);
    setSavedSceneExists(false);
  }, []);

  const saveSnapshot = useCallback((currentBatches: DrawBatch[], name?: string) => {
    const snapshot: SceneSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name ?? new Date().toLocaleString(),
      timestamp: Date.now(),
      batches: currentBatches,
    };

    setSnapshots((prev) => {
      const next = [snapshot, ...prev].slice(0, MAX_SNAPSHOTS);
      saveSnapshots(next);
      return next;
    });
  }, []);

  const restoreSnapshot = useCallback((id: string): DrawBatch[] | null => {
    const current = loadSnapshots();
    const snap = current.find((s) => s.id === id);
    return snap?.batches ?? null;
  }, []);

  const deleteSnapshot = useCallback((id: string) => {
    setSnapshots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSnapshots(next);
      return next;
    });
  }, []);

  return {
    savedSceneExists,
    restoreScene,
    clearSavedScene,
    snapshots,
    saveSnapshot,
    restoreSnapshot,
    deleteSnapshot,
  };
}
