'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import type { DrawBatch, DrawElement } from '@/types/agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    case 'angle_arc': return '∠';
    case 'integral_region': return '∫';
    case 'histogram': return '▥';
    case 'bezier_curve': return '⌒';
    case 'annotation_arrow': return '⤷';
    case 'formula_box': return '□';
    default: return '•';
  }
}

/** Return a short identifying label for an element. */
function elementLabel(el: DrawElement): string {
  const record = el as unknown as Record<string, unknown>;
  if (typeof record.label === 'string' && record.label) return record.label;
  if (typeof record.text === 'string' && record.text) {
    const t = record.text as string;
    return t.length > 30 ? `${t.slice(0, 30)}…` : t;
  }
  if (typeof record.tex === 'string' && record.tex) {
    const t = record.tex as string;
    return t.length > 30 ? `${t.slice(0, 30)}…` : t;
  }
  if (typeof record.xLabel === 'string' && record.xLabel) return record.xLabel as string;
  if (typeof record.expression === 'string' && record.expression) return record.expression as string;
  return record.id as string ?? '—';
}

function computeTypeCounts(scene: DrawElement[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const el of scene) {
    counts[el.type] = (counts[el.type] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ElementInspectorProps {
  scene: DrawElement[];
  batches: DrawBatch[];
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ElementInspector = memo(function ElementInspector({
  scene,
  batches,
  open,
  onClose,
}: ElementInspectorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const typeCounts = useMemo(() => computeTypeCounts(scene), [scene]);
  const typeEntries = useMemo(
    () => Object.entries(typeCounts).sort(([, a], [, b]) => b - a),
    [typeCounts],
  );

  const lastBatch: DrawBatch | undefined = batches.length > 0 ? batches[batches.length - 1] : undefined;

  const selectedElement = selectedIndex !== null && selectedIndex < scene.length ? scene[selectedIndex] : null;

  const handleElementClick = useCallback((idx: number) => {
    setSelectedIndex((prev) => (prev === idx ? null : idx));
  }, []);

  return (
    <div
      data-testid="element-inspector"
      className={`absolute right-0 top-0 z-20 flex h-full w-72 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      aria-label="Element Inspector"
      role="complementary"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          🔍 Inspector
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text-primary)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 text-[11px]">
        {/* Scene Summary */}
        <section className="mb-3">
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Scene Summary
          </h3>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[var(--color-text-muted)]">Total Elements</span>
            <span data-testid="inspector-total-count" className="font-medium text-[var(--color-text-primary)]">
              {scene.length}
            </span>
          </div>
          {typeEntries.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {typeEntries.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between py-0.5">
                  <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
                    <span className="w-3 text-center text-[10px]">{typeIcon(type)}</span>
                    {count}× {type}
                  </span>
                </div>
              ))}
            </div>
          )}
          {scene.length === 0 && (
            <p data-testid="inspector-empty" className="py-2 text-center text-[var(--color-text-muted)] italic">
              No elements in scene
            </p>
          )}
        </section>

        {/* Last Batch Info */}
        {lastBatch && (
          <section className="mb-3 border-t border-[var(--color-border)] pt-2">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Last Batch
            </h3>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Batch ID</span>
                <span className="max-w-[120px] truncate font-mono text-[10px] text-[var(--color-text-secondary)]" title={lastBatch.batch_id}>
                  {lastBatch.batch_id.slice(0, 12)}
                </span>
              </div>
              {lastBatch.sequenceNumber != null && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Sequence</span>
                  <span className="font-medium text-[var(--color-text-secondary)]">{lastBatch.sequenceNumber}</span>
                </div>
              )}
              {lastBatch.colorTheme && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Color Theme</span>
                  <span className="font-medium text-[var(--color-text-secondary)]">{lastBatch.colorTheme}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Elements</span>
                <span className="font-medium text-[var(--color-text-secondary)]">{lastBatch.elements.length}</span>
              </div>
            </div>
          </section>
        )}

        {/* Element List */}
        {scene.length > 0 && (
          <section className="mb-3 border-t border-[var(--color-border)] pt-2">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Elements
            </h3>
            <ul className="max-h-48 space-y-0.5 overflow-y-auto" role="list">
              {scene.map((el, idx) => (
                <li key={el.id ?? idx}>
                  <button
                    type="button"
                    onClick={() => handleElementClick(idx)}
                    data-testid={`inspector-element-${idx}`}
                    aria-expanded={selectedIndex === idx}
                    className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition ${
                      selectedIndex === idx
                        ? 'bg-[var(--color-accent-faint)] text-[var(--color-accent)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]'
                    }`}
                  >
                    <span className="w-3 shrink-0 text-center text-[10px]">{typeIcon(el.type)}</span>
                    <span className="font-medium">{el.type}</span>
                    <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                      {elementLabel(el)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* JSON View */}
        {selectedElement && (
          <section className="border-t border-[var(--color-border)] pt-2">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              JSON Schema
            </h3>
            <pre
              data-testid="inspector-json"
              className="max-h-64 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-secondary)]"
            >
              {JSON.stringify(selectedElement, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
});
