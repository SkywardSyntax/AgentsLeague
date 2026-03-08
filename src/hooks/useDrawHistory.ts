import { useCallback, useRef, useState } from 'react';
import type { DrawBatch } from '@/types/agent';

const MAX_HISTORY = 50;

interface PerChatHistory {
  past: DrawBatch[][];
  future: DrawBatch[][];
}

export interface UseDrawHistory {
  canUndo: boolean;
  canRedo: boolean;
  /** Snapshot the given batches array into history (call before mutating). */
  pushState(batches: DrawBatch[]): void;
  /** Pop the most recent snapshot and return it, or null if nothing to undo. */
  undo(): DrawBatch[] | null;
  /** Re-apply the last undone snapshot, or null if nothing to redo. */
  redo(): DrawBatch[] | null;
  /** Discard all history for the current chat. */
  clear(): void;
}

/**
 * Manages undo / redo history for whiteboard drawing batches.
 *
 * Each "state" stored in the history is a full `DrawBatch[]` snapshot.
 * The hook maintains separate stacks per `chatId` so switching chats
 * preserves each chat's history independently.
 *
 * @param chatId         – active chat identifier (history is keyed on this)
 * @param currentBatches – the live batches array from the active chat session
 */
export function useDrawHistory(chatId: string, currentBatches: DrawBatch[]): UseDrawHistory {
  const historyRef = useRef(new Map<string, PerChatHistory>());
  // Keep a synchronously-updated ref to the live batches so undo/redo can
  // push the current state onto the opposite stack without a stale closure.
  const currentRef = useRef(currentBatches);
  currentRef.current = currentBatches;

  // Bumped on every mutation to re-derive canUndo / canRedo.
  const [, bump] = useState(0);

  const getEntry = useCallback((): PerChatHistory => {
    let h = historyRef.current.get(chatId);
    if (!h) {
      h = { past: [], future: [] };
      historyRef.current.set(chatId, h);
    }
    return h;
  }, [chatId]);

  const pushState = useCallback(
    (batches: DrawBatch[]) => {
      const h = getEntry();
      h.past = [...h.past, batches].slice(-MAX_HISTORY);
      h.future = [];
      bump((n) => n + 1);
    },
    [getEntry],
  );

  const undo = useCallback((): DrawBatch[] | null => {
    const h = getEntry();
    if (h.past.length === 0) return null;
    const previous = h.past.pop()!;
    h.future.push(currentRef.current);
    bump((n) => n + 1);
    return previous;
  }, [getEntry]);

  const redo = useCallback((): DrawBatch[] | null => {
    const h = getEntry();
    if (h.future.length === 0) return null;
    const next = h.future.pop()!;
    h.past.push(currentRef.current);
    if (h.past.length > MAX_HISTORY) h.past.shift();
    bump((n) => n + 1);
    return next;
  }, [getEntry]);

  const clear = useCallback(() => {
    historyRef.current.delete(chatId);
    bump((n) => n + 1);
  }, [chatId]);

  const h = getEntry();
  return {
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    pushState,
    undo,
    redo,
    clear,
  };
}
