'use client';

import { useCallback, useRef, useState } from 'react';
import type { DrawOp, HistoryEntry, HistoryStack } from '@/types';

export function useHistory() {
  const stackRef = useRef<HistoryStack>({ entries: [], pointer: -1 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    const { entries, pointer } = stackRef.current;
    setCanUndo(pointer >= 0);
    setCanRedo(pointer < entries.length - 1);
  }, []);

  const push = useCallback(
    (ops: DrawOp[], inverseOps: DrawOp[]) => {
      const stack = stackRef.current;
      // Truncate any redo entries
      stack.entries = stack.entries.slice(0, stack.pointer + 1);
      const entry: HistoryEntry = {
        timestamp: Date.now(),
        ops,
        inverseOps,
      };
      stack.entries.push(entry);
      stack.pointer = stack.entries.length - 1;
      updateFlags();
    },
    [updateFlags],
  );

  const undo = useCallback((): DrawOp[] | null => {
    const stack = stackRef.current;
    if (stack.pointer < 0) return null;
    const entry = stack.entries[stack.pointer];
    if (!entry) return null;
    stack.pointer--;
    updateFlags();
    return entry.inverseOps;
  }, [updateFlags]);

  const redo = useCallback((): DrawOp[] | null => {
    const stack = stackRef.current;
    if (stack.pointer >= stack.entries.length - 1) return null;
    stack.pointer++;
    const entry = stack.entries[stack.pointer];
    if (!entry) return null;
    updateFlags();
    return entry.ops;
  }, [updateFlags]);

  return { push, undo, redo, canUndo, canRedo } as const;
}
