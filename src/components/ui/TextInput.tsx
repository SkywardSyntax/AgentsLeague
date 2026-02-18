'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const MAX_LENGTH = 1000;

export interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export default function TextInput({ onSubmit, disabled = false }: TextInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus when enabled (e.g. mode switches to TEXT)
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
    // Reset height after clearing
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
  }, [value, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.shiftKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      if (next.length <= MAX_LENGTH) {
        setValue(next);
      }
    },
    [],
  );

  const handleClear = useCallback(() => {
    setValue('');
    textareaRef.current?.focus();
  }, []);

  const charCount = value.length;
  const nearLimit = charCount >= MAX_LENGTH * 0.9;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="text-input"
        className="text-xs font-medium text-[hsl(var(--color-text-secondary))]"
      >
        Message
      </label>

      <div className="relative">
        <textarea
          ref={textareaRef}
          id="text-input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type your message… (Ctrl+Enter to send)"
          maxLength={MAX_LENGTH}
          rows={1}
          aria-label="Message input"
          aria-describedby="text-input-hint"
          className="w-full resize-none rounded-[var(--radius-sm)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface-sunken))] px-3 py-2 pr-8 text-sm text-[hsl(var(--color-text-primary))] placeholder:text-[hsl(var(--color-text-tertiary))] transition-colors duration-[150ms] focus:border-[hsl(var(--color-accent))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-accent-subtle))] disabled:cursor-not-allowed disabled:opacity-50"
        />

        {/* Clear button */}
        {value.length > 0 && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear input"
            className="absolute right-2 top-2.5 flex h-5 w-5 items-center justify-center rounded text-[hsl(var(--color-text-tertiary))] transition-colors duration-[120ms] hover:text-[hsl(var(--color-text-primary))]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Footer: hint + character count */}
      <div className="flex items-center justify-between">
        <span
          id="text-input-hint"
          className="text-xs text-[hsl(var(--color-text-tertiary))]"
        >
          Ctrl+Enter or Shift+Enter to send
        </span>
        <span
          aria-live="polite"
          className={`text-xs tabular-nums ${
            nearLimit
              ? 'text-[hsl(var(--color-error))]'
              : 'text-[hsl(var(--color-text-tertiary))]'
          }`}
        >
          {charCount}/{MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}
