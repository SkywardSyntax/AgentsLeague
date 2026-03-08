'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { LatexSvg } from '@/components/chat/LatexSvg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MathInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LATEX_MARKERS = /[\\^_{}]/;

/** Returns true when the string looks like it contains LaTeX notation. */
export function containsLatex(text: string): boolean {
  return LATEX_MARKERS.test(text);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MathInputField = memo(function MathInputField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: MathInputFieldProps) {
  // Debounced value for the preview so rapid typing doesn't trigger re-renders.
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedValue(value), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  const showPreview = containsLatex(debouncedValue) && debouncedValue.trim().length > 0;

  return (
    <div className={className}>
      {label && (
        <span className="mb-0.5 block text-[9px] font-medium text-[var(--color-text-muted)]">
          {label}
        </span>
      )}

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder ?? 'Math input'}
        className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
      />

      {showPreview && (
        <div
          data-testid="math-preview"
          className="mt-1 rounded border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-1.5 text-center"
        >
          <LatexSvg tex={debouncedValue} displayMode={false} />
        </div>
      )}
    </div>
  );
});
