'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhiteboardExportHandle } from '@/lib/whiteboard/canvas-export';
import { triggerBlobDownload } from '@/lib/whiteboard/canvas-export';
import { useIsMobile } from '@/hooks/useIsMobile';

type ExportFormat = 'png' | 'svg' | 'clipboard';
type ExportScale = 1 | 2 | 4;

interface ExportButtonProps {
  whiteboardRef: React.RefObject<WhiteboardExportHandle | null>;
  className?: string;
}

export function ExportButton({ whiteboardRef, className }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState<ExportScale>(2);
  const [whiteBackground, setWhiteBackground] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    const id = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(id);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const handleExport = useCallback(async () => {
    const handle = whiteboardRef.current;
    if (!handle) {
      showFeedback('Whiteboard not ready');
      return;
    }

    setIsExporting(true);
    try {
      switch (format) {
        case 'png': {
          const blob = await handle.exportAsPNG(scale, whiteBackground);
          triggerBlobDownload(blob, `whiteboard-${Date.now()}.png`);
          showFeedback(`Exported PNG at ${scale}×`);
          break;
        }
        case 'svg': {
          const svgString = handle.exportAsSVG();
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          triggerBlobDownload(blob, `whiteboard-${Date.now()}.svg`);
          showFeedback('Exported SVG');
          break;
        }
        case 'clipboard': {
          try {
            await handle.copyToClipboard();
            showFeedback('Copied to clipboard ✓');
          } catch (err) {
            // G7: auto-fallback to download when clipboard is unavailable
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('HTTPS') || msg.includes('Clipboard') || msg.includes('SecurityError')) {
              const blob = await handle.exportAsPNG(2, true);
              triggerBlobDownload(blob, `whiteboard-${Date.now()}.png`);
              showFeedback('Clipboard unavailable — downloaded PNG');
            } else {
              throw err;
            }
          }
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      showFeedback(`Error: ${msg}`);
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  }, [format, scale, whiteBackground, whiteboardRef, showFeedback]);

  // ---- Shared options panel content ----
  const optionsContent = (
    <>
      {/* Format selector */}
      <fieldset className="mb-2">
        <legend className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Format
        </legend>
        <div className="flex gap-1">
          {(['png', 'svg', 'clipboard'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="menuitemradio"
              aria-checked={format === f}
              onClick={() => setFormat(f)}
              className={`flex-1 rounded-md px-2 py-1 text-xs transition-all duration-150
                ${format === f
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : 'bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                }`}
            >
              {f === 'clipboard' ? '📋 Copy' : f.toUpperCase()}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Resolution selector (PNG only) */}
      {format === 'png' && (
        <fieldset className="mb-2">
          <legend className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Resolution
          </legend>
          <div className="flex gap-1">
            {([1, 2, 4] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={scale === s}
                onClick={() => setScale(s)}
                className={`flex-1 rounded-md px-2 py-1 text-xs transition-all duration-150
                  ${scale === s
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                  }`}
              >
                {s}× {s === 1 ? '(72dpi)' : s === 2 ? '(retina)' : '(print)'}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* Background toggle (PNG + clipboard only) */}
      {format !== 'svg' && (
        <label className="mb-3 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={whiteBackground}
            onChange={(e) => setWhiteBackground(e.target.checked)}
            className="rounded"
          />
          White background
        </label>
      )}

      {/* Export action */}
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        className="w-full rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium
                   text-white transition-all duration-150 hover:opacity-90 hover:shadow-md
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]
                   disabled:opacity-50"
      >
        {isExporting ? 'Exporting…' : format === 'clipboard' ? 'Copy to clipboard' : `Download ${format.toUpperCase()}`}
      </button>
    </>
  );

  return (
    <div className={`relative inline-block ${className ?? ''}`}>
      {/* Toggle button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={isExporting}
        aria-label="Export whiteboard"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="glass-panel flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]
                   shadow-[var(--shadow-card)] transition-all duration-150 hover:bg-[var(--color-surface)] hover:shadow-lg
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]
                   disabled:opacity-50"
        title="Export whiteboard"
      >
        {isExporting ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spinner">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
        Export
      </button>

      {/* Feedback toast */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`animate-slide-up-in absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg
                     border px-2.5 py-1 text-xs font-medium shadow-lg
                     ${feedback.includes('✓') || feedback.includes('Exported')
                       ? 'animate-success-flash border-[var(--color-accent-soft)] bg-[var(--color-surface)] text-[var(--color-accent)]'
                       : feedback.startsWith('Error')
                         ? 'border-[var(--color-danger)]/30 bg-[var(--color-surface)] text-[var(--color-danger)]'
                         : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                     }`}
        >
          {feedback}
        </div>
      )}

      {/* Mobile: full-screen modal */}
      {isOpen && isMobile && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
          <div
            ref={menuRef}
            role="dialog"
            aria-label="Export options"
            className="w-full max-w-md rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg safe-bottom"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Export</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close export"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-soft)]"
              >
                ✕
              </button>
            </div>
            {optionsContent}
          </div>
        </div>
      )}

      {/* Desktop: dropdown menu — opens upward to stay within canvas bounds */}
      {isOpen && !isMobile && (
        <div
          ref={menuRef}
          role="menu"
          className="animate-dropdown-in absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-[var(--color-border)]
                     bg-[var(--color-panel)] p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl"
        >
          {optionsContent}
        </div>
      )}
    </div>
  );
}
