'use client';

import { memo, useEffect, useState } from 'react';

export type DrawingPillState =
  | { kind: 'idle' }
  | { kind: 'ai_drawing'; elementCount: number }
  | { kind: 'injecting' }
  | { kind: 'done'; shapeCount: number };

interface DrawingStatusPillProps {
  state: DrawingPillState;
}

/**
 * Small pill overlay in the top-right corner of the canvas area.
 * Shows real-time drawing status during AI generation or injection.
 */
export const DrawingStatusPill = memo(function DrawingStatusPill({
  state,
}: DrawingStatusPillProps) {
  const [flash, setFlash] = useState<{ count: number } | null>(null);

  useEffect(() => {
    if (state.kind === 'done') {
      setFlash({ count: state.shapeCount });
      const timer = setTimeout(() => setFlash(null), 2400);
      return () => clearTimeout(timer);
    }
    setFlash(null);
  }, [state]);

  if (state.kind === 'idle' && !flash) return null;

  const showFlash = state.kind === 'idle' && flash;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute right-3 top-3 z-10"
    >
      {showFlash ? (
        <div className="animate-flash-pill flex items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-50/90 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-emerald-950/80 dark:text-emerald-300">
          <span aria-hidden="true">✓</span>
          <span>{flash.count} shape{flash.count !== 1 ? 's' : ''} drawn</span>
        </div>
      ) : state.kind === 'ai_drawing' ? (
        <div className="flex items-center gap-1.5 rounded-full border border-indigo-300/50 bg-indigo-50/90 px-2.5 py-1 text-[11px] font-medium text-indigo-700 shadow-sm backdrop-blur-sm dark:border-indigo-700/40 dark:bg-indigo-950/80 dark:text-indigo-300">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" aria-hidden="true" />
          <span>AI Drawing{state.elementCount > 0 ? ` (${state.elementCount})` : '…'}</span>
        </div>
      ) : state.kind === 'injecting' ? (
        <div className="flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-50/90 px-2.5 py-1 text-[11px] font-medium text-amber-700 shadow-sm backdrop-blur-sm dark:border-amber-700/40 dark:bg-amber-950/80 dark:text-amber-300">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
          <span>Injecting…</span>
        </div>
      ) : state.kind === 'done' ? (
        <div className="animate-flash-pill flex items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-50/90 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-emerald-950/80 dark:text-emerald-300">
          <span aria-hidden="true">✓</span>
          <span>{state.shapeCount} shape{state.shapeCount !== 1 ? 's' : ''} drawn</span>
        </div>
      ) : null}
    </div>
  );
});
