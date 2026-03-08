'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'mint';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent)] text-white hover:shadow-[var(--shadow-glow-accent)]',
  ghost:
    'bg-transparent text-[var(--color-text-secondary)] border border-transparent hover:border-[var(--color-border)] hover:text-[var(--color-text-primary)]',
  danger:
    'bg-[var(--color-danger)] text-white hover:brightness-110',
  mint:
    'bg-[var(--color-mint)] text-[#09090F] font-semibold hover:shadow-[var(--shadow-glow-mint)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-10 px-5 text-sm gap-2.5 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', loading, disabled, className, children, ...props },
    ref,
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-medium transition-all duration-150',
          'active:scale-[0.98] hover:scale-[1.02]',
          'disabled:opacity-50 disabled:pointer-events-none disabled:scale-100',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]',
          'cursor-pointer',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {loading && (
          <svg
            className="h-3.5 w-3.5 animate-spinner"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="28"
              strokeDashoffset="8"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
