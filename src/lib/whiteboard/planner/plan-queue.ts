/**
 * Plan queue — cancels in-flight planning when a newer request arrives.
 * Only the latest plan result is delivered; earlier promises reject with AbortError.
 */

export interface PlanQueue<T> {
  enqueue(planFn: (signal: AbortSignal) => Promise<T>): Promise<T>;
  isPlanning(): boolean;
  cancel(): void;
}

export function createPlanQueue<T>(): PlanQueue<T> {
  let currentController: AbortController | null = null;
  let currentPromise: Promise<T> | null = null;

  function enqueue(planFn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    // Cancel any in-flight plan
    if (currentController) {
      currentController.abort();
    }

    const controller = new AbortController();
    currentController = controller;

    const internalPromise = planFn(controller.signal).then((result) => {
      if (currentController === controller) {
        currentController = null;
        currentPromise = null;
      }
      if (controller.signal.aborted) {
        throw new DOMException('Plan cancelled', 'AbortError');
      }
      return result;
    }, (err) => {
      if (currentController === controller) {
        currentController = null;
        currentPromise = null;
      }
      if (controller.signal.aborted) {
        throw new DOMException('Plan cancelled', 'AbortError');
      }
      throw err;
    });

    // Prevent unhandled rejection for internally-cancelled promises
    internalPromise.catch(() => {});

    currentPromise = internalPromise;
    return internalPromise;
  }

  function cancel(): void {
    if (currentController) {
      currentController.abort();
      currentController = null;
      currentPromise = null;
    }
  }

  return {
    enqueue,
    isPlanning: () => currentController !== null,
    cancel,
  };
}
