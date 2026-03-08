'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import type { DrawBatch } from '@/types/agent';
import type { LoweringDiagnostics } from '@/lib/whiteboard/planner';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnimationStats {
  averageFps: number;
  totalFrames: number;
}

export interface InjectionStats {
  lastInjectionMs: number | null;
}

export interface CacheStats {
  size: number;
  maxSize: number;
}

export interface QualityPanelProps {
  /** All batches currently on the canvas. */
  batches: DrawBatch[];
  /** Lowering diagnostics from the most recent injection. */
  loweringStats?: LoweringDiagnostics | null;
  /** Rolling FPS / frame stats from the canvas RAF loop. */
  animationStats?: AnimationStats | null;
  /** Time from POST to first stroke on canvas. */
  injectionStats?: InjectionStats | null;
  /** MathJax stroke cache hit/miss info. */
  cacheStats?: CacheStats | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countElementsByType(batches: DrawBatch[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const batch of batches) {
    for (const el of batch.elements) {
      counts[el.type] = (counts[el.type] ?? 0) + 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DrawingQualityPanel = memo(function DrawingQualityPanel({
  batches,
  loweringStats,
  animationStats,
  injectionStats,
  cacheStats,
}: QualityPanelProps) {
  const [visible, setVisible] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      setVisible((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  const elementCounts = countElementsByType(batches);
  const sortedTypes = Object.entries(elementCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div
      data-testid="quality-panel"
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        width: 320,
        maxHeight: '80vh',
        overflow: 'auto',
        background: 'rgba(0,0,0,0.85)',
        color: '#e0e0e0',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: 12,
        borderRadius: 8,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#80cbc4' }}>
        Drawing Quality Panel
      </h3>

      {/* ---- Element counts ---- */}
      <section style={{ marginBottom: 10 }}>
        <strong style={{ color: '#90caf9' }}>Element counts</strong>
        {sortedTypes.length === 0 ? (
          <div style={{ opacity: 0.6 }}>No elements</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #555', padding: '2px 4px' }}>Type</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #555', padding: '2px 4px' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {sortedTypes.map(([type, count]) => (
                <tr key={type}>
                  <td style={{ padding: '1px 4px' }}>{type}</td>
                  <td style={{ textAlign: 'right', padding: '1px 4px' }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- Lowering stats ---- */}
      <section style={{ marginBottom: 10 }}>
        <strong style={{ color: '#90caf9' }}>Lowering stats</strong>
        {loweringStats ? (
          <div style={{ marginTop: 4 }}>
            <div>Input elements: {loweringStats.inputCount}</div>
            <div>Output elements: {loweringStats.outputCount}</div>
            <div>Capped: {loweringStats.capped ? 'yes' : 'no'}</div>
            <div>Expand time: {loweringStats.timingMs.toFixed(2)} ms</div>
          </div>
        ) : (
          <div style={{ opacity: 0.6 }}>No lowering data</div>
        )}
      </section>

      {/* ---- Animation stats ---- */}
      <section style={{ marginBottom: 10 }}>
        <strong style={{ color: '#90caf9' }}>Animation stats</strong>
        {animationStats ? (
          <div style={{ marginTop: 4 }}>
            <div>Avg FPS: {animationStats.averageFps.toFixed(1)}</div>
            <div>Total frames: {animationStats.totalFrames}</div>
          </div>
        ) : (
          <div style={{ opacity: 0.6 }}>No animation data</div>
        )}
      </section>

      {/* ---- Injection timing ---- */}
      <section style={{ marginBottom: 10 }}>
        <strong style={{ color: '#90caf9' }}>Injection timing</strong>
        {injectionStats?.lastInjectionMs != null ? (
          <div style={{ marginTop: 4 }}>
            Last injection: {injectionStats.lastInjectionMs.toFixed(1)} ms
          </div>
        ) : (
          <div style={{ opacity: 0.6 }}>No injections yet</div>
        )}
      </section>

      {/* ---- Cache stats ---- */}
      <section>
        <strong style={{ color: '#90caf9' }}>MathJax cache</strong>
        {cacheStats ? (
          <div style={{ marginTop: 4 }}>
            <div>
              Entries: {cacheStats.size} / {cacheStats.maxSize}
            </div>
            <div>
              Fill: {cacheStats.maxSize > 0 ? ((cacheStats.size / cacheStats.maxSize) * 100).toFixed(1) : 0}%
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.6 }}>No cache data</div>
        )}
      </section>
    </div>
  );
});
