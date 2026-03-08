'use client';

import { memo, useEffect, useState } from 'react';
import type { DrawElement } from '@/types/agent';

export type DrawingPillState =
  | { kind: 'idle' }
  | { kind: 'ai_drawing'; elementCount: number; typeCounts?: Partial<Record<DrawElement['type'], number>> }
  | { kind: 'injecting' }
  | { kind: 'done'; shapeCount: number; typeCounts?: Partial<Record<DrawElement['type'], number>> };

interface DrawingStatusPillProps {
  state: DrawingPillState;
}

const TYPE_LABELS: Partial<Record<DrawElement['type'], string>> = {
  cartesian_axes: 'axes',
  function_curve: 'function',
  number_line: 'number line',
  vector_arrow: 'vector',
  matrix_bracket: 'matrix',
  angle_arc: 'angle',
  integral_region: 'integral',
  circle_with_radius: 'circle',
  triangle_with_angles: 'triangle',
};

function formatTypeHint(typeCounts: Partial<Record<DrawElement['type'], number>>): string {
  const entries = Object.entries(typeCounts)
    .filter(([, count]) => count && count > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  if (entries.length === 0) return '';
  return entries
    .slice(0, 3)
    .map(([type]) => TYPE_LABELS[type as DrawElement['type']] ?? type)
    .join(', ');
}

function formatDoneSummary(count: number, typeCounts?: Partial<Record<DrawElement['type'], number>>): string {
  const base = `${count} shape${count !== 1 ? 's' : ''} drawn`;
  if (!typeCounts) return base;
  const hint = formatTypeHint(typeCounts);
  return hint ? `${base} (${hint})` : base;
}

/**
 * Small pill overlay in the top-right corner of the canvas area.
 * Shows real-time drawing status during AI generation or injection.
 */
export const DrawingStatusPill = memo(function DrawingStatusPill({
  state,
}: DrawingStatusPillProps) {
  const [flash, setFlash] = useState<{ count: number; typeCounts?: Partial<Record<DrawElement['type'], number>> } | null>(null);

  useEffect(() => {
    if (state.kind === 'done') {
      setFlash({ count: state.shapeCount, typeCounts: state.typeCounts });
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
      aria-busy={state.kind === 'ai_drawing' || state.kind === 'injecting'}
      className="absolute right-3 top-3 z-10"
    >
      {showFlash ? (
        <div className="animate-flash-pill flex items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-50/90 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-emerald-950/80 dark:text-emerald-300">
          <span aria-hidden="true">✓</span>
          <span>{formatDoneSummary(flash.count, flash.typeCounts)}</span>
        </div>
      ) : state.kind === 'ai_drawing' ? (
        <div className="flex items-center gap-1.5 rounded-full border border-indigo-300/50 bg-indigo-50/90 px-2.5 py-1 text-[11px] font-medium text-indigo-700 shadow-sm backdrop-blur-sm dark:border-indigo-700/40 dark:bg-indigo-950/80 dark:text-indigo-300">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" aria-hidden="true" />
          <span>
            Drawing
            {state.typeCounts && Object.keys(state.typeCounts).length > 0
              ? `: ${formatTypeHint(state.typeCounts)}…`
              : state.elementCount > 0
                ? ` (${state.elementCount})`
                : '…'}
          </span>
        </div>
      ) : state.kind === 'injecting' ? (
        <div className="flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-50/90 px-2.5 py-1 text-[11px] font-medium text-amber-700 shadow-sm backdrop-blur-sm dark:border-amber-700/40 dark:bg-amber-950/80 dark:text-amber-300">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
          <span>Injecting…</span>
        </div>
      ) : state.kind === 'done' ? (
        <div className="animate-flash-pill flex items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-50/90 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-emerald-950/80 dark:text-emerald-300">
          <span aria-hidden="true">✓</span>
          <span>{formatDoneSummary(state.shapeCount, state.typeCounts)}</span>
        </div>
      ) : null}
    </div>
  );
});
