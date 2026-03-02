/**
 * Render frame guard — prevents concurrent RAF callbacks from drawing the same frame.
 * Only the latest scheduled callback executes; stale callbacks are no-ops.
 */

export interface FrameGuard {
  schedule(callback: (frameId: number) => void): number;
  cancel(): void;
  isPending(): boolean;
  currentFrameId(): number;
}

export function createFrameGuard(): FrameGuard {
  let nextFrameId = 0;
  let pendingId: number | null = null;
  let pendingRafHandle: number | null = null;

  function schedule(callback: (frameId: number) => void): number {
    // Cancel any previously-pending frame
    if (pendingRafHandle !== null) {
      cancelAnimationFrame(pendingRafHandle);
    }

    const frameId = ++nextFrameId;
    pendingId = frameId;

    pendingRafHandle = requestAnimationFrame(() => {
      // Stale check — only execute if this is still the latest scheduled frame
      if (pendingId !== frameId) return;
      pendingId = null;
      pendingRafHandle = null;
      callback(frameId);
    });

    return frameId;
  }

  function cancel(): void {
    if (pendingRafHandle !== null) {
      cancelAnimationFrame(pendingRafHandle);
      pendingRafHandle = null;
    }
    pendingId = null;
  }

  return {
    schedule,
    cancel,
    isPending: () => pendingId !== null,
    currentFrameId: () => nextFrameId,
  };
}
