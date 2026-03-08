'use client';

import { useCallback, type RefObject } from 'react';
import type { WhiteboardExportHandle } from '@/lib/whiteboard/canvas-export';
import { triggerBlobDownload } from '@/lib/whiteboard/canvas-export';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface ExportOptions {
  format: 'png' | 'svg';
  /** Pixel scale multiplier (1 = 72dpi, 2 = retina, 4 = print) */
  scale: number;
  background: 'white' | 'transparent';
}

export interface WhiteboardExportActions {
  exportAsPNG(options?: Partial<ExportOptions>): Promise<Blob>;
  exportAsSVG(): string;
  copyToClipboard(options?: Partial<ExportOptions>): Promise<void>;
  downloadAs(filename: string, options?: Partial<ExportOptions>): Promise<void>;
}

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'png',
  scale: 2,
  background: 'white',
};

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook that wraps the WhiteboardExportHandle imperative ref into a
 * convenient callback-based API for export operations.
 *
 * Addresses G1 (tainted canvas), G2 (full-content export), G7 (clipboard fallback)
 * by delegating to canvas-export.ts utilities.
 */
export function useWhiteboardExport(
  whiteboardRef: RefObject<WhiteboardExportHandle | null>,
): WhiteboardExportActions {
  const exportAsPNG = useCallback(
    async (options?: Partial<ExportOptions>): Promise<Blob> => {
      const handle = whiteboardRef.current;
      if (!handle) throw new Error('Whiteboard not ready');

      const opts = { ...DEFAULT_OPTIONS, ...options };
      return handle.exportAsPNG(opts.scale, opts.background === 'white');
    },
    [whiteboardRef],
  );

  const exportAsSVG = useCallback((): string => {
    const handle = whiteboardRef.current;
    if (!handle) throw new Error('Whiteboard not ready');
    return handle.exportAsSVG();
  }, [whiteboardRef]);

  const copyToClipboard = useCallback(
    async (_options?: Partial<ExportOptions>): Promise<void> => {
      const handle = whiteboardRef.current;
      if (!handle) throw new Error('Whiteboard not ready');

      try {
        await handle.copyToClipboard();
      } catch (err) {
        // G7: If clipboard fails (insecure context / permission denied),
        // fall back to PNG download so the user isn't stuck in a failure loop.
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('HTTPS') ||
          msg.includes('Clipboard') ||
          msg.includes('NotAllowedError') ||
          msg.includes('SecurityError')
        ) {
          const blob = await handle.exportAsPNG(2, true);
          triggerBlobDownload(blob, `whiteboard-${Date.now()}.png`);
          throw new Error('Clipboard unavailable — downloaded PNG instead.');
        }
        throw err;
      }
    },
    [whiteboardRef],
  );

  const downloadAs = useCallback(
    async (filename: string, options?: Partial<ExportOptions>): Promise<void> => {
      const opts = { ...DEFAULT_OPTIONS, ...options };
      const handle = whiteboardRef.current;
      if (!handle) throw new Error('Whiteboard not ready');

      if (opts.format === 'svg') {
        const svgString = handle.exportAsSVG();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        triggerBlobDownload(blob, filename.endsWith('.svg') ? filename : `${filename}.svg`);
        return;
      }

      // PNG path
      const blob = await handle.exportAsPNG(opts.scale, opts.background === 'white');
      triggerBlobDownload(blob, filename.endsWith('.png') ? filename : `${filename}.png`);
    },
    [whiteboardRef],
  );

  return { exportAsPNG, exportAsSVG, copyToClipboard, downloadAs };
}
