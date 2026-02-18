'use client';

import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { WhiteboardRenderer } from '@/lib/renderer/WhiteboardRenderer';

/**
 * React hook that manages a WhiteboardRenderer instance.
 *
 * - Tracks canvas ref and creates renderer on mount
 * - Resizes on window resize and DPR changes
 * - Exposes render() and clear() methods
 */
export function useRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
) {
  const rendererRef = useRef<WhiteboardRenderer | null>(null);

  // Initialize / resize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    const renderer = new WhiteboardRenderer(ctx, rect.width, rect.height, dpr);
    rendererRef.current = renderer;

    const handleResize = () => {
      const r = canvas.getBoundingClientRect();
      const newDpr = window.devicePixelRatio || 1;
      renderer.resize(r.width, r.height, newDpr);
    };

    window.addEventListener('resize', handleResize);

    // Watch for DPR changes (e.g. dragging between monitors)
    const dprMedia = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`,
    );
    const handleDprChange = () => handleResize();
    dprMedia.addEventListener('change', handleDprChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      dprMedia.removeEventListener('change', handleDprChange);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [canvasRef]);

  const render = useCallback(() => {
    rendererRef.current?.renderFull();
  }, []);

  const clear = useCallback(() => {
    rendererRef.current?.clear();
  }, []);

  return { rendererRef, render, clear } as const;
}
