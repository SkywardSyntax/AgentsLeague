import { useCallback, useEffect, useRef } from 'react';

interface WarningOverlayProps {
  warnings: string[];
  onDismiss?: () => void;
}

export function WarningOverlay({ warnings, onDismiss }: WarningOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onDismiss) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  useEffect(() => {
    if (warnings.length === 0) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [warnings.length, handleKeyDown]);

  if (warnings.length === 0) return null;

  return (
    <div ref={containerRef} role="status" aria-live="polite" aria-label="Warnings" className="absolute bottom-4 left-4 z-20 max-w-md space-y-2">
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss warning"
          onClick={onDismiss}
          className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-secondary)] shadow-sm hover:bg-[var(--color-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          ✕
        </button>
      )}
      {warnings.map((warning, i) => (
        <p
          key={`${warning}-${i}`}
          className="glass-panel rounded-xl border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-warning-text)] shadow-[var(--shadow-card)]"
        >
          {warning}
        </p>
      ))}
    </div>
  );
}
