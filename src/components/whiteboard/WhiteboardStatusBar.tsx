'use client';

import { memo } from 'react';
import { useTheme } from '@/components/app/ThemeProvider';

interface WhiteboardStatusBarProps {
  elementCount: number;
  zoom: number;
  autoSaved: boolean;
}

export const WhiteboardStatusBar = memo(function WhiteboardStatusBar({
  elementCount,
  zoom,
  autoSaved,
}: WhiteboardStatusBarProps) {
  const { theme } = useTheme();

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t border-[var(--color-border)]/40 bg-[var(--color-panel)]/70 px-3 py-1 text-[10px] tabular-nums text-[var(--color-text-muted)] backdrop-blur-md"
      role="status"
      aria-label="Whiteboard status"
      data-testid="whiteboard-status-bar"
    >
      <div className="flex items-center gap-3">
        <span data-testid="status-element-count">
          {elementCount} element{elementCount !== 1 ? 's' : ''}
        </span>
        <span aria-hidden="true" className="opacity-30">·</span>
        <span data-testid="status-theme" className="capitalize">
          {theme}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="status-zoom">{(zoom * 100).toFixed(0)}%</span>
        <span aria-hidden="true" className="opacity-30">·</span>
        <span data-testid="status-save" className="flex items-center gap-1">
          {autoSaved ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
              Auto-saved
            </>
          ) : (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]" aria-hidden="true" />
              Not saved
            </>
          )}
        </span>
      </div>
    </div>
  );
});
