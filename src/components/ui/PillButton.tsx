import { memo } from 'react';
import type { ButtonHTMLAttributes } from 'react';

const variantStyles = {
  default:
    'border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-high)]',
  accent:
    'border-[var(--color-accent)]/45 bg-[var(--color-accent-faint)] text-[var(--color-text-primary)]',
  ghost:
    'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]',
} as const;

const sizeStyles = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-3 py-1.5 text-xs',
} as const;

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
}

export const PillButton = memo(function PillButton({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: PillButtonProps) {
  return (
    <button
      type="button"
      className={`btn-press rounded-full border font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
