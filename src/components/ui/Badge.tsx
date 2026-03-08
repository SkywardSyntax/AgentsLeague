import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'accent' | 'mint' | 'amber' | 'danger';

interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]',
  accent:
    'bg-[var(--color-accent-faint)] text-[var(--color-accent)] border-[var(--color-accent)]/20',
  mint:
    'bg-[var(--color-mint-glow)] text-[var(--color-mint)] border-[var(--color-mint)]/20',
  amber:
    'bg-[var(--color-warning-bg)] text-[var(--color-amber)] border-[var(--color-amber)]/20',
  danger:
    'bg-[rgba(255,79,79,0.1)] text-[var(--color-danger)] border-[var(--color-danger)]/20',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-text-muted)]',
  accent: 'bg-[var(--color-accent)]',
  mint: 'bg-[var(--color-mint)]',
  amber: 'bg-[var(--color-amber)]',
  danger: 'bg-[var(--color-danger)]',
};

export function Badge({ variant = 'default', dot, children, className }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && (
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${dotColors[variant]}`}
        />
      )}
      {children}
    </span>
  );
}
