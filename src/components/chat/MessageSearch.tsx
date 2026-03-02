'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface MessageSearchProps {
  onSearch: (query: string) => void;
  matchCount: number;
  visible: boolean;
  onClose: () => void;
}

export function MessageSearch({ onSearch, matchCount, visible, onClose }: MessageSearchProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onSearch(value), 200);
    },
    [onSearch],
  );

  const handleClose = useCallback(() => {
    clearTimeout(debounceRef.current);
    setQuery('');
    onSearch('');
    onClose();
  }, [onSearch, onClose]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-soft)]/80 px-4 py-2">
      <input
        ref={inputRef}
        type="search"
        aria-label="Search messages"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') handleClose();
        }}
        placeholder="Search messages…"
        className="flex-1 rounded-lg border border-[var(--color-border)] bg-white/88 px-2.5 py-1 text-sm outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-soft)]"
      />
      <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
        {query ? `${matchCount} result${matchCount !== 1 ? 's' : ''}` : ''}
      </span>
      <button
        type="button"
        aria-label="Close search"
        onClick={handleClose}
        className="rounded-full px-2 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-white/75"
      >
        ✕
      </button>
    </div>
  );
}
