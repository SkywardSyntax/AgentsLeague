'use client';

import { memo } from 'react';
import { useErrorHandling, dismissToast, type Toast, type ToastType } from '@/hooks/useErrorHandling';

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const ACCENT: Record<ToastType, string> = {
  success: 'text-[hsl(var(--color-success))]',
  error: 'text-[hsl(var(--color-error))]',
  info: 'text-[hsl(var(--color-accent))]',
  warning: 'text-[hsl(var(--color-warning))]',
};

const ToastItem = memo(function ToastItem({ toast }: { readonly toast: Toast }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 rounded-xl border border-[hsl(var(--color-border-subtle))] bg-[hsl(var(--color-surface)/0.85)] px-4 py-3 shadow-lg backdrop-blur-xl text-sm text-[hsl(var(--color-text-primary))] animate-[toastSlideIn_var(--duration-normal,250ms)_var(--ease-out-expo,cubic-bezier(0.16,1,0.3,1))]"
    >
      <span aria-hidden="true" className={`text-base font-semibold ${ACCENT[toast.type]}`}>
        {ICONS[toast.type]}
      </span>
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.handler}
          className="ml-1 text-[hsl(var(--color-accent))] font-medium hover:opacity-80 transition-opacity"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss"
        className="ml-0.5 rounded-md p-0.5 opacity-40 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
});

export function ToastContainer() {
  const { toasts } = useErrorHandling();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-toast flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm sm:w-auto"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
