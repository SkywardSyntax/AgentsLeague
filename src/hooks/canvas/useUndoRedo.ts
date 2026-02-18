'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { CommandHistory } from '@/lib/history/CommandHistory';
import type { Command } from '@/lib/history/CommandHistory';

export interface UseUndoRedoReturn {
  /** Push and execute a command. */
  push: (command: Command) => void;
  /** Undo the last command. */
  undo: () => boolean;
  /** Redo the last undone command. */
  redo: () => boolean;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Start a batch of commands (merged into 1 undo step). */
  startBatch: () => void;
  /** End the current batch. */
  endBatch: () => void;
  /** Clear all history. */
  clear: () => void;
}

export function useUndoRedo(): UseUndoRedoReturn {
  const historyRef = useRef(new CommandHistory());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, []);

  const push = useCallback(
    (command: Command) => {
      historyRef.current.push(command);
      syncFlags();
    },
    [syncFlags],
  );

  const undo = useCallback(() => {
    const result = historyRef.current.undo();
    syncFlags();
    return result;
  }, [syncFlags]);

  const redo = useCallback(() => {
    const result = historyRef.current.redo();
    syncFlags();
    return result;
  }, [syncFlags]);

  const startBatch = useCallback(() => {
    historyRef.current.startBatch();
  }, []);

  const endBatch = useCallback(() => {
    historyRef.current.endBatch();
    syncFlags();
  }, [syncFlags]);

  const clear = useCallback(() => {
    historyRef.current.clear();
    syncFlags();
  }, [syncFlags]);

  return useMemo(
    () => ({ push, undo, redo, canUndo, canRedo, startBatch, endBatch, clear }),
    [push, undo, redo, canUndo, canRedo, startBatch, endBatch, clear],
  );
}
