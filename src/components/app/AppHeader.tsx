import { useTheme } from '@/components/app/ThemeProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface AppHeaderProps {
  status: 'idle' | 'thinking' | 'streaming' | 'drawing';
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
}

export function AppHeader({ status, canUndo, canRedo, onUndo, onRedo, inspectorOpen, onToggleInspector }: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4 sm:px-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-white shadow-sm" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <div>
          <h1 className="font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
            AgentsLeague
          </h1>
          <p className="text-[11px] leading-tight text-[var(--color-text-muted)]">AI-powered whiteboard</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Undo (⌘Z)"
          title="Undo (⌘Z)"
          disabled={!canUndo}
          onClick={onUndo}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-35"
          data-testid="undo-btn"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Redo (⌘⇧Z)"
          title="Redo (⌘⇧Z)"
          disabled={!canRedo}
          onClick={onRedo}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-35"
          data-testid="redo-btn"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={inspectorOpen ? 'Close Inspector' : 'Open Inspector'}
          title="🔍 Inspector"
          onClick={onToggleInspector}
          data-testid="inspector-toggle"
          className={`flex h-8 items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
            inspectorOpen
              ? 'bg-[var(--color-accent-faint)] text-[var(--color-accent)]'
              : 'bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
          }`}
        >
          🔍
          <span className="hidden sm:inline">Inspector</span>
        </button>
        <button
          type="button"
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          data-testid="theme-toggle"
        >
          {theme === 'light' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
        <StatusBadge status={status} />
      </div>
    </header>
  );
}
