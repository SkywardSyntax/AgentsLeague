'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

export interface CanvasRefs {
  bgRef: RefObject<HTMLCanvasElement | null>;
  contentRef: RefObject<HTMLCanvasElement | null>;
  activeDrawRef: RefObject<HTMLCanvasElement | null>;
  cursorRef: RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  dpr: number;
}

export interface CanvasContextHelpers {
  getBgContext: () => CanvasRenderingContext2D | null;
  getContentContext: () => CanvasRenderingContext2D | null;
  getActiveDrawContext: () => CanvasRenderingContext2D | null;
  getCursorContext: () => CanvasRenderingContext2D | null;
}

export type UseCanvasRefsReturn = CanvasRefs & CanvasContextHelpers;

const RESIZE_DEBOUNCE_MS = 150;

/**
 * Configures a single canvas element for DPR-aware rendering.
 * Sets the backing store size and CSS display size, then scales the context.
 */
function configureCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
): void {
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

/** Returns a 2D context from a canvas ref, or null. */
function getContext(
  ref: RefObject<HTMLCanvasElement | null>,
): CanvasRenderingContext2D | null {
  return ref.current?.getContext('2d') ?? null;
}

/**
 * Creates and manages four stacked canvas refs with DPR scaling.
 *
 * Attach the returned refs to your `<canvas>` elements. The hook
 * listens for window resize events (debounced) and re-applies
 * backing-store and CSS dimensions automatically.
 *
 * @param containerRef - ref to the parent element whose size determines canvas dimensions
 */
export function useCanvasRefs(
  containerRef: RefObject<HTMLElement | null>,
): UseCanvasRefsReturn {
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const contentRef = useRef<HTMLCanvasElement | null>(null);
  const activeDrawRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLCanvasElement | null>(null);

  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [dpr, setDpr] = useState(1);

  const syncSizes = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const currentDpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

    setWidth(w);
    setHeight(h);
    setDpr(currentDpr);

    const refs = [bgRef, contentRef, activeDrawRef, cursorRef];
    for (const ref of refs) {
      if (ref.current) {
        configureCanvas(ref.current, w, h, currentDpr);
      }
    }
  }, [containerRef]);

  // Initial sizing + debounced resize listener
  useEffect(() => {
    syncSizes();

    let timerId: ReturnType<typeof setTimeout> | undefined;

    const handleResize = () => {
      clearTimeout(timerId);
      timerId = setTimeout(syncSizes, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timerId);
    };
  }, [syncSizes]);

  const getBgContext = useCallback(() => getContext(bgRef), []);
  const getContentContext = useCallback(() => getContext(contentRef), []);
  const getActiveDrawContext = useCallback(() => getContext(activeDrawRef), []);
  const getCursorContext = useCallback(() => getContext(cursorRef), []);

  return {
    bgRef,
    contentRef,
    activeDrawRef,
    cursorRef,
    width,
    height,
    dpr,
    getBgContext,
    getContentContext,
    getActiveDrawContext,
    getCursorContext,
  };
}
