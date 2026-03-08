interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Separator({ orientation = 'horizontal', className }: SeparatorProps) {
  return orientation === 'horizontal' ? (
    <div
      role="separator"
      className={`h-px w-full bg-[var(--color-border-subtle)] ${className ?? ''}`}
    />
  ) : (
    <div
      role="separator"
      aria-orientation="vertical"
      className={`w-px self-stretch bg-[var(--color-border-subtle)] ${className ?? ''}`}
    />
  );
}
