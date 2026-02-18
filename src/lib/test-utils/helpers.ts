/**
 * Test helpers for the AI Whiteboard application.
 *
 * - renderWithProviders() — wrap test component with Zustand store, providers
 * - createMockStream() for SSE testing
 * - Performance diff assertions
 * - Mock rAF controller
 */

import { vi } from 'vitest';
import type { DrawElement, DrawOp } from '@/types';
import type { WhiteboardStore } from '@/lib/tool-workflow/DrawToolLoop';

// ── renderWithProviders ─────────────────────────────────────────────

/**
 * Lightweight render wrapper. Since Zustand stores are module-level
 * singletons, we reset store state between tests instead of wrapping
 * in a provider tree. For components that need WhiteboardContext,
 * import WhiteboardProvider directly.
 *
 * Usage:
 *   import { renderWithProviders } from '@/lib/test-utils/helpers';
 *   const { getByText } = renderWithProviders(<ChatPanel />);
 */
export async function renderWithProviders(ui: React.ReactElement) {
  const { render } = await import('@testing-library/react');
  const { createElement } = await import('react');
  const { WhiteboardProvider } = await import('@/stores/whiteboard-store');

  return render(createElement(WhiteboardProvider, null, ui));
}

// ── Mock SSE Stream ─────────────────────────────────────────────────

/**
 * Create a ReadableStream that emits SSE events, simulating the /api/draw endpoint.
 */
export function createMockStream(
  events: { data: string; delayMs?: number }[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for (const event of events) {
        if (event.delayMs) {
          await sleep(event.delayMs);
        }
        controller.enqueue(encoder.encode(`data: ${event.data}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

/**
 * Create a mock SSE stream from DrawOp objects.
 */
export function createMockDrawOpStream(
  ops: DrawOp[],
  options: { delayMs?: number } = {},
): ReadableStream<Uint8Array> {
  return createMockStream(
    ops.map((op) => ({
      data: JSON.stringify(op),
      ...(options.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
    })),
  );
}

// ── Mock fetch for SSE ──────────────────────────────────────────────

/**
 * Create a mock fetch function that returns an SSE stream response.
 */
export function createMockFetch(stream: ReadableStream<Uint8Array>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
  });
}

// ── Mock rAF Controller ─────────────────────────────────────────────

export interface RAFController {
  /** Flush all pending rAF callbacks at the given timestamp. */
  flush: (timestamp: number) => void;
  /** Install the mock rAF globally. */
  install: () => void;
  /** Restore original rAF. */
  restore: () => void;
  /** Number of pending callbacks. */
  readonly pending: number;
}

export function createRAFController(): RAFController {
  let callbacks: { id: number; cb: FrameRequestCallback }[] = [];
  let nextId = 1;

  const origRaf = globalThis.requestAnimationFrame;
  const origCaf = globalThis.cancelAnimationFrame;

  return {
    flush(timestamp: number) {
      const cbs = [...callbacks];
      callbacks = [];
      for (const { cb } of cbs) {
        cb(timestamp);
      }
    },

    install() {
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
        const id = nextId++;
        callbacks.push({ id, cb });
        return id;
      };
      globalThis.cancelAnimationFrame = (id: number) => {
        callbacks = callbacks.filter((c) => c.id !== id);
      };
    },

    restore() {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCaf;
      callbacks = [];
      nextId = 1;
    },

    get pending() {
      return callbacks.length;
    },
  };
}

// ── Mock WhiteboardStore ────────────────────────────────────────────

export function createMockWhiteboardStore(
  initial: DrawElement[] = [],
): WhiteboardStore {
  const elements = new Map<string, DrawElement>(
    initial.map((el) => [el.id, el]),
  );

  return {
    getElements: () => elements,
    applyOps: (ops: DrawOp[]) => {
      for (const op of ops) {
        switch (op.op) {
          case 'add':
            elements.set(op.element.id, op.element);
            break;
          case 'update': {
            const existing = elements.get(op.id);
            if (existing) {
              elements.set(op.id, { ...existing, ...op.patch } as DrawElement);
            }
            break;
          }
          case 'delete':
            elements.delete(op.id);
            break;
          case 'clear':
            elements.clear();
            break;
        }
      }
    },
  };
}

// ── Performance Assertion Helpers ───────────────────────────────────

export interface FrameTiming {
  timestamp: number;
  durationMs: number;
}

/**
 * Assert that all frame durations are under the jank threshold.
 */
export function assertNoJank(
  frames: FrameTiming[],
  thresholdMs = 50,
): void {
  const janky = frames.filter((f) => f.durationMs > thresholdMs);
  if (janky.length > 0) {
    const details = janky
      .map((f) => `${f.durationMs.toFixed(1)}ms at t=${f.timestamp}`)
      .join(', ');
    throw new Error(
      `Jank detected: ${janky.length} frame(s) exceeded ${thresholdMs}ms threshold: ${details}`,
    );
  }
}

/**
 * Assert sustained FPS above a minimum over a series of frame timestamps.
 */
export function assertMinFPS(
  frameTimestamps: number[],
  minFPS = 60,
  windowMs = 1000,
): void {
  if (frameTimestamps.length < 2) return;

  const start = frameTimestamps[0]!;
  const end = frameTimestamps[frameTimestamps.length - 1]!;
  const durationMs = end - start;

  if (durationMs < windowMs) return; // Not enough data

  const fps = ((frameTimestamps.length - 1) / durationMs) * 1000;
  if (fps < minFPS) {
    throw new Error(
      `FPS too low: ${fps.toFixed(1)} fps (minimum: ${minFPS}) over ${durationMs.toFixed(0)}ms`,
    );
  }
}

/**
 * Measure TTFT (Time to First Token) from a stream.
 */
export async function measureTTFT(
  streamFn: () => Promise<ReadableStream<Uint8Array>>,
): Promise<number> {
  const startMs = performance.now();
  const stream = await streamFn();
  const reader = stream.getReader();

  const { done } = await reader.read();
  const ttft = performance.now() - startMs;
  reader.releaseLock();

  if (done) {
    throw new Error('Stream was empty — no first token');
  }

  return ttft;
}

// ── Utilities ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true, polling at intervals.
 */
export async function waitForCondition(
  condition: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const { timeoutMs = 5000, intervalMs = 50 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(intervalMs);
  }

  throw new Error(`waitForCondition timed out after ${timeoutMs}ms`);
}
