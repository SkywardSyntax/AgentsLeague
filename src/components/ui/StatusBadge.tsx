interface StatusBadgeProps {
  status: 'idle' | 'thinking' | 'streaming' | 'drawing';
}

const toneMap = {
  idle: 'bg-emerald-500',
  thinking: 'bg-amber-500',
  streaming: 'bg-sky-500',
  drawing: 'bg-indigo-500',
} as const;

const labelMap = {
  idle: 'Ready',
  thinking: 'Thinking',
  streaming: 'Responding',
  drawing: 'Drawing',
} as const;

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5">
      <span
        className={`h-2 w-2 rounded-full ${toneMap[status]} ${status !== 'idle' ? 'pulse-active' : ''}`}
        data-testid="status-dot"
      />
      <span
        className="text-[11px] font-medium text-[var(--color-text-secondary)]"
        data-testid="status-label"
      >
        {labelMap[status]}
      </span>
    </div>
  );
}
