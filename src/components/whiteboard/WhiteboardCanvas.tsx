'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useCanvasRefs } from '@/hooks/canvas/useCanvasRefs';
import { useRenderer } from '@/hooks/canvas/useRenderer';
import { useSelection } from '@/hooks/canvas/useSelection';
import { useUndoRedo } from '@/hooks/canvas/useUndoRedo';
import { useStreamingDraw } from '@/hooks/canvas/useStreamingDraw';
import { useWhiteboard } from '@/stores/whiteboard-store';
import { useDrawingSessionStore } from '@/stores/drawing-session';
import { useTheme } from '@/hooks/useTheme';
import { GestureHandler } from '@/lib/gestures/GestureHandler';
import {
  SkeletonRenderer,
  type SkeletonConfig,
} from '@/lib/performance/SkeletonRenderer';
import type { Camera, DrawElement, TextElement, BoundingBox } from '@/types';

// ─── Props ────────────────────────────────────────────────

export interface WhiteboardCanvasProps {
  width?: number;
  height?: number;
  onElementsChange?: (els: DrawElement[]) => void;
  /** SSE endpoint for AI draw streaming. */
  streamEndpoint?: string;
  /** Enable performance profiling overlay (default: false). */
  enableProfiling?: boolean;
}

// ─── Constants ────────────────────────────────────────────

const ZOOM_SENSITIVITY = 0.001;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const PERF_LOG_INTERVAL_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function getTextElements(elements: Map<string, DrawElement>): TextElement[] {
  const texts: TextElement[] = [];
  for (const el of elements.values()) {
    if (el.type === 'text') texts.push(el);
  }
  return texts;
}

// ─── Component ────────────────────────────────────────────

export default function WhiteboardCanvas({
  width,
  height,
  onElementsChange,
  streamEndpoint,
  enableProfiling = false,
}: WhiteboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const isDragging = useRef(false);
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const prevElementsRef = useRef<Map<string, DrawElement>>(new Map());
  const gestureRef = useRef<GestureHandler | null>(null);
  const skeletonRef = useRef<SkeletonRenderer | null>(null);
  const perfIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Theme ─────────────────────────────────────────────
  const { theme } = useTheme();

  // ── Loading state for first-draw skeleton ─────────────
  const [isFirstDrawLoading, setIsFirstDrawLoading] = useState(false);

  // ── 4-layer canvas refs with DPR scaling ──────────────
  const {
    bgRef,
    contentRef,
    activeDrawRef,
    cursorRef,
    dpr,
    width: canvasWidth,
    height: canvasHeight,
    getActiveDrawContext,
  } = useCanvasRefs(containerRef);

  // ── Renderer bound to content layer ───────────────────
  const { rendererRef, logPerformance } = useRenderer(contentRef);

  // ── Whiteboard context store ──────────────────────────
  const { elements, camera, setCamera, selectedIds, setSelectedIds } = useWhiteboard();

  // ── Drawing session (zustand) ─────────────────────────
  const drawingState = useDrawingSessionStore((s) => s.drawingState);
  const _commitOps = useDrawingSessionStore((s) => s.commitOps);

  // ── Selection ─────────────────────────────────────────
  const selection = useSelection();

  // Sync whiteboard selected IDs ↔ selection hook
  useEffect(() => {
    setSelectedIds(new Set(selection.selectedIds));
  }, [selection.selectedIds, setSelectedIds]);

  // Keep spatial index in sync with elements
  useEffect(() => {
    selection.updateIndex(Array.from(elements.values()));
  }, [elements, selection]);

  // ── Undo / Redo ───────────────────────────────────────
  const undoRedo = useUndoRedo();

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRedo.undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        undoRedo.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoRedo]);

  // ── Streaming draw ────────────────────────────────────
  const streamOpts = useMemo(() => ({
    ...(streamEndpoint != null ? { endpoint: streamEndpoint } : {}),
  }), [streamEndpoint]);

  const [streamState] = useStreamingDraw({
    ...streamOpts,
    onFirstElement: () => {
      // Dismiss skeleton when first element arrives
      setIsFirstDrawLoading(false);
      skeletonRef.current?.destroy();
    },
    onComplete: () => {
      setIsFirstDrawLoading(false);
    },
    onError: () => {
      setIsFirstDrawLoading(false);
      skeletonRef.current?.destroy();
    },
  });

  // Show skeleton when drawing state transitions to 'processing'
  useEffect(() => {
    if (drawingState.status === 'processing') {
      setIsFirstDrawLoading(true);
      const ctx = getActiveDrawContext();
      if (ctx) {
        skeletonRef.current ??= new SkeletonRenderer();
        const bounds: BoundingBox = {
          x: canvasWidth * 0.15,
          y: canvasHeight * 0.15,
          w: canvasWidth * 0.7,
          h: canvasHeight * 0.7,
        };
        const config: SkeletonConfig = {
          estimatedBounds: bounds,
          estimatedShapeCount: 4,
          animation: 'shimmer',
          timeoutMs: 15_000,
        };
        skeletonRef.current.show(ctx, config, () => {
          setIsFirstDrawLoading(false);
        });
      }
    } else {
      skeletonRef.current?.destroy();
    }
  }, [drawingState.status, getActiveDrawContext, canvasWidth, canvasHeight]);

  // Cleanup skeleton on unmount
  useEffect(() => {
    return () => {
      skeletonRef.current?.destroy();
    };
  }, []);

  // ── Sync elements to renderer & notify parent ─────────

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const allElements = Array.from(elements.values());
    renderer.upsertElements(allElements);

    // Remove elements no longer present
    for (const id of prevElementsRef.current.keys()) {
      if (!elements.has(id)) {
        renderer.removeElement(id);
      }
    }
    prevElementsRef.current = new Map(elements);

    onElementsChange?.(allElements);
  }, [elements, rendererRef, onElementsChange]);

  // ── Performance profiling ─────────────────────────────

  useEffect(() => {
    if (!enableProfiling) return;

    perfIntervalRef.current = setInterval(() => {
      logPerformance();
    }, PERF_LOG_INTERVAL_MS);

    return () => {
      if (perfIntervalRef.current !== null) {
        clearInterval(perfIntervalRef.current);
        perfIntervalRef.current = null;
      }
    };
  }, [enableProfiling, logPerformance]);

  // ── RAF rendering loop ────────────────────────────────

  useEffect(() => {
    let running = true;

    const loop = (timestamp: number) => {
      if (!running) return;

      const renderer = rendererRef.current;
      if (renderer) {
        if (enableProfiling) renderer.perfMonitor.tick(timestamp);
        renderer.renderFull(camera);
      }

      // Draw background grid
      drawBackground(bgRef.current, camera, dpr, theme);

      // Render selection highlights on cursor layer
      drawSelectionHighlights(cursorRef.current, camera, dpr, selection.getHighlights());

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [camera, dpr, rendererRef, bgRef, cursorRef, theme, enableProfiling, selection]);

  // ── GestureHandler (touch gestures via imperative API) ─

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const gesture = new GestureHandler();
    gestureRef.current = gesture;

    gesture.on('tap', (e) => {
      const rect = container.getBoundingClientRect();
      const worldX = (e.position.x - rect.left - camera.x) / camera.zoom;
      const worldY = (e.position.y - rect.top - camera.y) / camera.zoom;
      const hits = selection.hitTest(worldX, worldY);
      if (hits.length > 0 && hits[0]) {
        selection.selectElement(hits[0].id);
      } else {
        selection.deselectAll();
      }
    });

    gesture.on('pinch', (e) => {
      const rect = container.getBoundingClientRect();
      const cx = e.position.x - rect.left;
      const cy = e.position.y - rect.top;
      const newZoom = clampZoom(camera.zoom * e.scale);
      const actualScale = newZoom / camera.zoom;
      setCamera({
        x: cx - (cx - camera.x) * actualScale,
        y: cy - (cy - camera.y) * actualScale,
        zoom: newZoom,
      });
    });

    gesture.on('three-finger-undo', () => {
      undoRedo.undo();
    });

    gesture.attach(container);

    return () => {
      gesture.detach(container);
      gestureRef.current = null;
    };
  }, [camera, setCamera, selection, undoRedo]);

  // ── Pointer event handlers (pan) ──────────────────────

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Middle-click or space+click for panning
      if (e.button === 1 || e.button === 0) {
        isDragging.current = true;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;

      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };

      setCamera({
        x: camera.x + dx,
        y: camera.y + dy,
        zoom: camera.zoom,
      });
    },
    [camera, setCamera],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      isDragging.current = false;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
    [],
  );

  // ── Wheel handler (zoom) ──────────────────────────────

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();

      const newZoom = clampZoom(camera.zoom - e.deltaY * ZOOM_SENSITIVITY);
      const scale = newZoom / camera.zoom;

      // Zoom toward cursor position
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      setCamera({
        x: cursorX - (cursorX - camera.x) * scale,
        y: cursorY - (cursorY - camera.y) * scale,
        zoom: newZoom,
      });
    },
    [camera, setCamera],
  );

  // ── Touch handlers ────────────────────────────────────

  const touchStartRef = useRef<{ x: number; y: number; dist: number }>({
    x: 0,
    y: 0,
    dist: 0,
  });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        const t0 = e.touches.item(0);
        const t1 = e.touches.item(1);
        if (!t0 || !t1) return;
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const dist = Math.hypot(
          t1.clientX - t0.clientX,
          t1.clientY - t0.clientY,
        );
        touchStartRef.current = { x: midX, y: midY, dist };
      }
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t0 = e.touches.item(0);
        const t1 = e.touches.item(1);
        if (!t0 || !t1) return;
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const dist = Math.hypot(
          t1.clientX - t0.clientX,
          t1.clientY - t0.clientY,
        );

        const prevDist = touchStartRef.current.dist;
        if (prevDist === 0) return;

        const scale = dist / prevDist;
        const newZoom = clampZoom(camera.zoom * scale);
        const actualScale = newZoom / camera.zoom;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const cx = midX - rect.left;
        const cy = midY - rect.top;

        setCamera({
          x: cx - (cx - camera.x) * actualScale,
          y: cy - (cy - camera.y) * actualScale,
          zoom: newZoom,
        });

        touchStartRef.current = { x: midX, y: midY, dist };
      }
    },
    [camera, setCamera],
  );

  // ── Text overlay elements ─────────────────────────────

  const textElements = useMemo(() => getTextElements(elements), [elements]);

  // ── Container style ───────────────────────────────────

  const containerStyle = useMemo(
    () => ({
      width: width ? `${width}px` : '100%',
      height: height ? `${height}px` : '100%',
    }),
    [width, height],
  );

  // ── Streaming progress bar ────────────────────────────
  const showProgress = streamState.isStreaming && streamState.progress > 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[var(--color-canvas-bg)]"
      style={containerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      tabIndex={0}
      role="application"
      aria-label="Interactive whiteboard canvas. Use toolbar to select drawing tools."
      aria-roledescription="whiteboard"
    >
      {/* 4-layer canvas stack */}
      <div className="absolute inset-0">
        {/* BackgroundLayer — z-0 */}
        <canvas
          ref={bgRef}
          className="absolute inset-0 z-0 h-full w-full"
          aria-hidden="true"
        />
        {/* ContentLayer — z-10 */}
        <canvas
          ref={contentRef}
          className="absolute inset-0 z-10 h-full w-full"
          aria-hidden="true"
        />
        {/* ActiveDrawLayer — z-20 */}
        <canvas
          ref={activeDrawRef}
          className="absolute inset-0 z-20 h-full w-full"
          aria-hidden="true"
        />
        {/* CursorLayer — z-30 */}
        <canvas
          ref={cursorRef}
          className="absolute inset-0 z-30 h-full w-full pointer-events-none"
          aria-hidden="true"
        />
      </div>

      {/* Loading skeleton overlay */}
      {isFirstDrawLoading && (
        <div
          className="absolute inset-0 z-35 flex items-center justify-center pointer-events-none"
          aria-live="polite"
          aria-label="Loading drawing"
        >
          <div className="animate-pulse text-sm text-[var(--color-text-secondary)] select-none">
            Generating drawing…
          </div>
        </div>
      )}

      {/* Streaming progress bar */}
      {showProgress && (
        <div
          className="absolute top-0 left-0 right-0 z-50 h-1"
          role="progressbar"
          aria-valuenow={Math.round(streamState.progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Drawing progress"
        >
          <div
            className="h-full bg-blue-500 transition-[width] duration-200 ease-out"
            style={{ width: `${streamState.progress}%` }}
          />
        </div>
      )}

      {/* TextOverlay — DOM-based text nodes positioned over canvas */}
      <div className="absolute inset-0 z-40 pointer-events-none">
        {textElements.map((el) => (
          <div
            key={el.id}
            className={`absolute pointer-events-auto${
              selectedIds.has(el.id) ? ' ring-2 ring-blue-500 ring-offset-1' : ''
            }`}
            style={{
              left: el.x * camera.zoom + camera.x,
              top: el.y * camera.zoom + camera.y,
              width: el.w * camera.zoom,
              height: el.h * camera.zoom,
              transform: el.rotation
                ? `rotate(${el.rotation}deg)`
                : undefined,
              opacity: el.opacity,
              fontFamily: el.style.fontFamily,
              fontSize: el.style.fontSize * camera.zoom,
              fontWeight: el.style.fontWeight,
              lineHeight: el.style.lineHeight,
              letterSpacing: el.style.letterSpacing,
              color: el.style.color,
              textAlign: el.style.align,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              userSelect: 'none',
            }}
          >
            {el.content}
          </div>
        ))}
      </div>

      {/* Screen reader accessible description of canvas content */}
      <div className="sr-only" role="list" aria-label="Canvas objects">
        {textElements.length === 0 ? (
          <p>Empty canvas. Use the toolbar to select a drawing tool and begin drawing.</p>
        ) : (
          textElements.map((el) => (
            <div key={el.id} role="listitem">
              Text element: {el.content}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Background grid renderer ───────────────────────────

function drawBackground(
  canvas: HTMLCanvasElement | null,
  camera: Camera,
  dpr: number,
  theme: 'light' | 'dark',
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Dot grid (visible in light mode; subtle in dark mode)
  const gridSize = 20;
  const scaledGrid = gridSize * camera.zoom;
  if (scaledGrid < 4) {
    ctx.restore();
    return;
  }

  const offsetX = camera.x % scaledGrid;
  const offsetY = camera.y % scaledGrid;

  ctx.fillStyle =
    theme === 'light'
      ? 'rgba(0, 0, 0, 0.10)'
      : 'rgba(128, 128, 128, 0.15)';
  const dotRadius = Math.max(0.5, camera.zoom * 0.8);

  for (let x = offsetX; x < w; x += scaledGrid) {
    for (let y = offsetY; y < h; y += scaledGrid) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ─── Selection highlight renderer ───────────────────────

function drawSelectionHighlights(
  canvas: HTMLCanvasElement | null,
  camera: Camera,
  dpr: number,
  highlights: { bounds: BoundingBox; handleSize?: number }[],
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (highlights.length === 0) {
    ctx.restore();
    return;
  }

  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);

  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5 / camera.zoom;
  ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);

  for (const hl of highlights) {
    const { bounds } = hl;
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  ctx.setLineDash([]);
  ctx.restore();
}
