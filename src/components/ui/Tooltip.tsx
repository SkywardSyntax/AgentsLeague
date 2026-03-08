import type { ReactNode } from 'react';

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
}

export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const posClass =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
      : 'top-full left-1/2 -translate-x-1/2 mt-1.5';

  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={[
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1',
          'bg-[var(--color-surface-high)] text-[var(--color-text-primary)] text-[11px] font-medium',
          'border border-[var(--color-border)] shadow-lg',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
          posClass,
        ].join(' ')}
      >
        {label}
      </span>
    </span>
  );
}
