import { useCallback, useEffect, useRef, useState } from 'react';

export type NotificationSeverity = 'warning' | 'error';

export interface NotificationItem {
  id: string;
  message: string;
  severity: NotificationSeverity;
}

interface WarningOverlayProps {
  notifications: NotificationItem[];
  onDismissOne?: (id: string) => void;
  onDismissAll?: () => void;
}

const AUTO_DISMISS_MS = 5_000;

const severityClasses: Record<NotificationSeverity, string> = {
  warning:
    'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  error:
    'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
};

const severityIcon: Record<NotificationSeverity, string> = {
  warning: '⚠',
  error: '✕',
};

export function WarningOverlay({ notifications, onDismissOne, onDismissAll }: WarningOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Auto-dismiss warnings (not errors) after timeout
  useEffect(() => {
    for (const n of notifications) {
      if (n.severity !== 'warning') continue;
      if (dismissed.has(n.id)) continue;
      if (timersRef.current.has(n.id)) continue;

      const timer = setTimeout(() => {
        timersRef.current.delete(n.id);
        if (onDismissOne) {
          onDismissOne(n.id);
        } else {
          setDismissed((prev) => new Set(prev).add(n.id));
        }
      }, AUTO_DISMISS_MS);
      timersRef.current.set(n.id, timer);
    }

    return () => {
      // Clean up timers for notifications that were removed
      for (const [id, timer] of timersRef.current) {
        if (!notifications.some((n) => n.id === id)) {
          clearTimeout(timer);
          timersRef.current.delete(id);
        }
      }
    };
  }, [notifications, dismissed, onDismissOne]);

  // Clean up all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // Escape key dismisses all
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onDismissAll) {
        onDismissAll();
      }
    },
    [onDismissAll],
  );

  useEffect(() => {
    if (notifications.length === 0) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [notifications.length, handleKeyDown]);

  const visible = notifications.filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="status"
      aria-live="polite"
      aria-label="Notifications"
      className="absolute bottom-4 left-4 z-20 flex max-w-sm flex-col gap-2"
    >
      {visible.map((notification) => (
        <div
          key={notification.id}
          className={`glass-panel flex items-start gap-2 rounded-xl border px-3 py-2 text-xs shadow-[var(--shadow-card)] animate-rise-in ${severityClasses[notification.severity]}`}
        >
          <span className="mt-0.5 shrink-0 text-sm leading-none" aria-hidden="true">
            {severityIcon[notification.severity]}
          </span>
          <p className="flex-1 leading-relaxed">{notification.message}</p>
          <button
            type="button"
            aria-label={`Dismiss ${notification.severity}`}
            onClick={() => {
              if (onDismissOne) {
                onDismissOne(notification.id);
              } else {
                setDismissed((prev) => new Set(prev).add(notification.id));
              }
            }}
            className="ml-1 shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            ✕
          </button>
        </div>
      ))}
      {visible.length > 1 && onDismissAll && (
        <button
          type="button"
          onClick={onDismissAll}
          className="self-start rounded-lg px-2 py-1 text-[10px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Dismiss all
        </button>
      )}
    </div>
  );
}
