'use client';

import type { DrawElement } from '@/types/agent';

export type StreamPhase = 'connecting' | 'thinking' | 'streaming_text' | 'drawing' | 'complete';

export interface DrawingProgressInfo {
  /** Number of elements drawn so far in this turn */
  elementCount: number;
  /** Breakdown of element types in the current batch */
  typeCounts: Partial<Record<DrawElement['type'], number>>;
  /** Whether a batch just completed (for flash feedback) */
  batchJustCompleted: boolean;
}

interface StreamProgressProps {
  phase: StreamPhase;
  retryAttempt?: number;
  maxRetries?: number;
  drawingProgress?: DrawingProgressInfo;
}

const PHASE_LABELS: Record<StreamPhase, string> = {
  connecting: 'Connecting…',
  thinking: 'Thinking…',
  streaming_text: 'Writing…',
  drawing: 'Drawing…',
  complete: 'Done',
};

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="animate-draw-pencil"
    >
      <path
        d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 3.5L12.5 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatTypeCounts(typeCounts: Partial<Record<DrawElement['type'], number>>): string {
  const entries = Object.entries(typeCounts).filter(([, count]) => count && count > 0);
  if (entries.length === 0) return '';
  return entries.map(([type, count]) => `${count} ${type}`).join(', ');
}

function buildDrawingLabel(progress: DrawingProgressInfo): string {
  if (progress.batchJustCompleted) {
    const breakdown = formatTypeCounts(progress.typeCounts);
    const suffix = breakdown ? ` (${breakdown})` : '';
    return `Drew ${progress.elementCount} shape${progress.elementCount !== 1 ? 's' : ''}${suffix}`;
  }
  if (progress.elementCount > 0) {
    return `Drawing ${progress.elementCount} element${progress.elementCount !== 1 ? 's' : ''}…`;
  }
  return 'Drawing…';
}

export function StreamProgress({ phase, retryAttempt, maxRetries, drawingProgress }: StreamProgressProps) {
  if (phase === 'complete') return null;

  const isDrawing = phase === 'drawing';
  const label =
    isDrawing && drawingProgress
      ? buildDrawingLabel(drawingProgress)
      : PHASE_LABELS[phase];
  const retrying = retryAttempt != null && retryAttempt > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-[var(--color-text-muted)]"
    >
      {isDrawing ? (
        <PencilIcon />
      ) : (
        <span
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]"
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
      {isDrawing && drawingProgress?.batchJustCompleted && (
        <span
          className="animate-fade-in text-emerald-600"
          aria-hidden="true"
        >
          ✓
        </span>
      )}
      {retrying && (
        <span
          role="alert"
          className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
        >
          Reconnecting… attempt {retryAttempt}/{maxRetries ?? '?'}
        </span>
      )}
    </div>
  );
}
