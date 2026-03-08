'use client';

import { memo, useCallback, useState } from 'react';
import type { DrawBatch, DrawElement } from '@/types/agent';
import type { SceneSnapshot } from '@/hooks/useScenePersistence';

export type DrawSource = 'AI' | 'Injected' | 'Template' | 'None';

interface DrawingStatisticsProps {
  scene: DrawElement[];
  batches: DrawBatch[];
  lastDrawSource: DrawSource;
  onCopyScene?: () => void;
  snapshots?: SceneSnapshot[];
  onSaveSnapshot?: () => void;
  onRestoreSnapshot?: (id: string) => void;
  onDeleteSnapshot?: (id: string) => void;
}

function computeTypeCounts(scene: DrawElement[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const el of scene) {
    counts[el.type] = (counts[el.type] ?? 0) + 1;
  }
  return counts;
}

function typeIcon(type: string): string {
  switch (type) {
    case 'rect': return '▭';
    case 'ellipse': return '◯';
    case 'line': return '╱';
    case 'arrow': return '→';
    case 'text': return 'T';
    case 'latex': return '∑';
    case 'cartesian_axes': return '⊞';
    case 'function_curve': return '∿';
    case 'number_line': return '⟼';
    case 'vector_arrow': return '⟶';
    default: return '•';
  }
}

const SOURCE_STYLES: Record<DrawSource, string> = {
  AI: 'text-indigo-600 dark:text-indigo-400',
  Injected: 'text-amber-600 dark:text-amber-400',
  Template: 'text-sky-600 dark:text-sky-400',
  None: 'text-[var(--color-text-muted)]',
};

function formatSnapshotTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Collapsible mini-panel showing drawing statistics.
 * Positioned in the bottom-right of the whiteboard area.
 */
export const DrawingStatistics = memo(function DrawingStatistics({
  scene,
  batches,
  lastDrawSource,
  onCopyScene,
  snapshots,
  onSaveSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
}: DrawingStatisticsProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const typeCounts = computeTypeCounts(scene);
  const typeEntries = Object.entries(typeCounts).sort(([, a], [, b]) => b - a);
  const totalElements = scene.length;
  const batchCount = batches.filter(
    (b) => !b.elements.every((el) => el.type === 'clear'),
  ).length;

  const handleCopy = useCallback(() => {
    if (onCopyScene) {
      onCopyScene();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [onCopyScene]);

  const handleSaveSnapshot = useCallback(() => {
    if (onSaveSnapshot) {
      onSaveSnapshot();
      setSnapshotSaved(true);
      setTimeout(() => setSnapshotSaved(false), 2000);
    }
  }, [onSaveSnapshot]);

  return (
    <div className="absolute bottom-3 right-3 z-10">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
        aria-label="Drawing statistics"
        className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] shadow-sm backdrop-blur-sm transition hover:bg-[var(--color-surface)]"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="9" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
          <rect x="6.5" y="5" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.7" />
          <rect x="11" y="2" width="3" height="12" rx="0.5" fill="currentColor" />
        </svg>
        <span>{totalElements} element{totalElements !== 1 ? 's' : ''}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-1.5 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-md backdrop-blur-md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Drawing Stats
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Total</span>
              <span className="font-medium text-[var(--color-text-primary)]">{totalElements}</span>
            </div>

            {typeEntries.length > 0 && (
              <div className="border-t border-[var(--color-border)] pt-1.5">
                {typeEntries.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between py-0.5">
                    <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
                      <span className="w-3 text-center text-[10px]">{typeIcon(type)}</span>
                      {type}
                    </span>
                    <span className="font-medium text-[var(--color-text-secondary)]">{count}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-[var(--color-border)] pt-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Batches</span>
                <span className="font-medium text-[var(--color-text-primary)]">{batchCount}</span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[var(--color-text-muted)]">Source</span>
                <span className={`font-medium ${SOURCE_STYLES[lastDrawSource]}`}>
                  {lastDrawSource}
                </span>
              </div>
            </div>

            {onCopyScene && totalElements > 0 && (
              <div className="border-t border-[var(--color-border)] pt-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy scene as JSON to clipboard"
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                >
                  {copied ? (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400" aria-hidden="true">✓</span>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="5" y="5" width="9" height="9" rx="1.5" />
                        <path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11" />
                      </svg>
                      Copy as JSON
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Snapshots section */}
            {onSaveSnapshot && (
              <div className="border-t border-[var(--color-border)] pt-2">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Snapshots
                </div>
                <button
                  type="button"
                  onClick={handleSaveSnapshot}
                  disabled={totalElements === 0}
                  aria-label="Save snapshot"
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-40"
                >
                  {snapshotSaved ? (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400" aria-hidden="true">✓</span>
                      Saved!
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      Save Snapshot
                    </>
                  )}
                </button>

                {snapshots && snapshots.length > 0 && (
                  <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
                    {snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-1"
                      >
                        <span className="truncate text-[10px] text-[var(--color-text-muted)]" title={snap.name}>
                          {formatSnapshotTime(snap.timestamp)}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          {onRestoreSnapshot && (
                            <button
                              type="button"
                              onClick={() => onRestoreSnapshot(snap.id)}
                              aria-label={`Restore snapshot ${snap.name}`}
                              className="rounded px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-faint)]"
                            >
                              Restore
                            </button>
                          )}
                          {onDeleteSnapshot && (
                            <button
                              type="button"
                              onClick={() => onDeleteSnapshot(snap.id)}
                              aria-label={`Delete snapshot ${snap.name}`}
                              className="rounded px-1 py-0.5 text-[9px] text-[var(--color-text-muted)] hover:text-red-500"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
