'use client';

import { useErrorHandling, dismissToast, type Toast, type ToastType } from '@/hooks/useErrorHandling';

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const STYLE: Record<ToastType, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-blue-600 text-white',
  warning: 'bg-yellow-500 text-black',
};

function ToastItem({ toast }: { readonly toast: Toast }) {
  return (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg text-sm ${STYLE[toast.type]} animate-[slideIn_0.2s_ease-out]`}
    >
      <span aria-hidden="true" className="text-base">{ICONS[toast.type]}</span>
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.handler}
          className="ml-2 underline font-medium hover:opacity-80"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss"
        className="ml-1 opacity-70 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useErrorHandling();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
