'use client';

import { type RefObject, useEffect, useRef } from 'react';

/** Sets up a canvas 2D context with proper DPR scaling. */
export function useCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
): RefObject<CanvasRenderingContext2D | null> {
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctxRef.current = ctx;
  }, [canvasRef]);

  return ctxRef;
}
