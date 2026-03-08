'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type IconButtonVariant = 'primary' | 'ghost' | 'danger' | 'mint';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  tooltip?: string;
  icon: ReactNode;
}

const variantClasses: Record<IconButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent)] text-white hover:shadow-[var(--shadow-glow-accent)]',
  ghost:
    'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]',
  danger:
    'bg-transparent text-[var(--color-text-secondary)] hover:bg-[rgba(255,79,79,0.1)] hover:text-[var(--color-danger)]',
  mint:
    'bg-[var(--color-mint-glow)] text-[var(--color-mint)] hover:bg-[var(--color-mint)] hover:text-[#09090F]',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ variant = 'ghost', tooltip, icon, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        title={tooltip}
        aria-label={tooltip}
        className={[
          'relative inline-flex h-8 w-8 items-center justify-center rounded-lg',
          'transition-all duration-150 active:scale-[0.95]',
          'disabled:opacity-50 disabled:pointer-events-none',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]',
          'cursor-pointer',
          variantClasses[variant],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {icon}
      </button>
    );
  },
);
