'use client';

export type StreamPhase = 'connecting' | 'thinking' | 'streaming_text' | 'drawing' | 'complete';

interface StreamProgressProps {
  phase: StreamPhase;
  retryAttempt?: number;
  maxRetries?: number;
}

const PHASE_LABELS: Record<StreamPhase, string> = {
  connecting: 'Connecting…',
  thinking: 'Thinking…',
  streaming_text: 'Writing…',
  drawing: 'Drawing…',
  complete: 'Done',
};

export function StreamProgress({ phase, retryAttempt, maxRetries }: StreamProgressProps) {
  if (phase === 'complete') return null;

  const label = PHASE_LABELS[phase];
  const retrying = retryAttempt != null && retryAttempt > 0;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-[var(--color-text-muted)]">
      <span
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]"
        aria-hidden="true"
      />
      <span>{label}</span>
      {retrying && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
          Reconnecting… attempt {retryAttempt}/{maxRetries ?? '?'}
        </span>
      )}
    </div>
  );
}
