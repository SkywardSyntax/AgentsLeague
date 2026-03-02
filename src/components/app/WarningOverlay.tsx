interface WarningOverlayProps {
  warnings: string[];
}

export function WarningOverlay({ warnings }: WarningOverlayProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-20 max-w-md space-y-2">
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
