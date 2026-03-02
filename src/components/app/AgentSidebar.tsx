interface AgentSidebarProps {
  agentDomain: string;
  statusLabel: string;
  agentLastQuery: string;
  agentRunning: boolean;
  onToggleAgent: () => void;
  onClear: () => void;
}

export function AgentSidebar({
  agentDomain,
  statusLabel,
  agentLastQuery,
  agentRunning,
  onToggleAgent,
  onClear,
}: AgentSidebarProps) {
  return (
    <aside
      data-testid="agent-sidebar"
      className="absolute right-4 top-4 z-20 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-3 shadow-lg backdrop-blur"
    >
      <p className="text-sm font-semibold text-[var(--color-text-primary)]">Agent Mode</p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        Domain: <span data-testid="agent-domain" className="font-medium">{agentDomain}</span> · Status: {statusLabel}
      </p>
      <p data-testid="agent-last-query" className="mt-2 line-clamp-3 text-xs text-[var(--color-text-muted)]">
        Last query: {agentLastQuery || '—'}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="agent-toggle"
          onClick={onToggleAgent}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface-soft)]"
        >
          {agentRunning ? 'Pause agent' : 'Resume agent'}
        </button>
        <button
          type="button"
          data-testid="agent-clear"
          onClick={onClear}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface-soft)]"
        >
          Clear
        </button>
      </div>
    </aside>
  );
}
