export class PlannerTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Planner timed out after ${timeoutMs}ms`);
    this.name = 'PlannerTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export interface PlannerTimeoutOptions {
  timeoutMs: number;
  onTimeout?: (elapsedMs: number) => void;
}

export async function withPlannerTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: PlannerTimeoutOptions,
): Promise<T> {
  const { timeoutMs, onTimeout } = opts;
  const controller = new AbortController();
  const start = Date.now();

  if (timeoutMs <= 0) {
    controller.abort();
    onTimeout?.(0);
    return Promise.reject(new PlannerTimeoutError(timeoutMs));
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      const elapsed = Date.now() - start;
      onTimeout?.(elapsed);
      reject(new PlannerTimeoutError(timeoutMs));
    }, timeoutMs);

    fn(controller.signal).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
