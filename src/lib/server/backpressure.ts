import type { AgentSSEEvent } from '@/types/agent';

export interface BackpressureOptions {
  highWaterMark: number;
  lowWaterMark: number;
  onDrop?: (event: AgentSSEEvent) => void;
}

export interface BackpressureController {
  /** Enqueue an event. Returns true if accepted, false if rejected (above highWaterMark). */
  offer(event: AgentSSEEvent): boolean;
  /** Current buffer-to-highWaterMark ratio (0–1). */
  pressure(): number;
  /** Whether the controller is in paused (backpressured) state. */
  isPaused(): boolean;
  /** Drain all buffered events and clear the buffer. Unpauses if below lowWaterMark. */
  drain(): AgentSSEEvent[];
}

export function createBackpressureController(
  opts: BackpressureOptions,
): BackpressureController {
  const { highWaterMark, lowWaterMark, onDrop } = opts;
  let buffer: AgentSSEEvent[] = [];
  let paused = false;

  return {
    offer(event) {
      if (buffer.length >= highWaterMark) {
        paused = true;
        onDrop?.(event);
        return false;
      }
      buffer.push(event);
      if (buffer.length >= highWaterMark) {
        paused = true;
      }
      return true;
    },

    pressure() {
      if (highWaterMark === 0) return 1;
      return Math.min(buffer.length / highWaterMark, 1);
    },

    isPaused() {
      return paused;
    },

    drain() {
      const items = buffer;
      buffer = [];
      if (buffer.length < lowWaterMark) {
        paused = false;
      }
      return items;
    },
  };
}
