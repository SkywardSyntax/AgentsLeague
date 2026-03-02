export type LazyStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface LazyLoader<T> {
  status: LazyStatus;
  load(): Promise<T>;
  preload(): void;
  getModule(): T | null;
  getError(): string | null;
  getLoadTimeMs(): number | null;
}

export function createLazyLoader<T>(
  importFn: () => Promise<T>,
): LazyLoader<T> {
  let status: LazyStatus = 'idle';
  let module: T | null = null;
  let error: string | null = null;
  let loadPromise: Promise<T> | null = null;
  let loadStartMs: number | null = null;
  let loadTimeMs: number | null = null;

  const loader: LazyLoader<T> = {
    get status() {
      return status;
    },

    load(): Promise<T> {
      // If already loaded, return resolved promise
      if (status === 'loaded' && module !== null) {
        return Promise.resolve(module);
      }

      // If errored, retry (new promise)
      if (status === 'error') {
        loadPromise = null;
      }

      // If already loading, return existing promise
      if (loadPromise) {
        return loadPromise;
      }

      status = 'loading';
      loadStartMs = performance.now();

      loadPromise = importFn()
        .then((result) => {
          module = result;
          status = 'loaded';
          loadTimeMs = performance.now() - loadStartMs!;
          return result;
        })
        .catch((err) => {
          status = 'error';
          error = err instanceof Error ? err.message : String(err);
          loadPromise = null;
          throw err;
        });

      return loadPromise;
    },

    preload(): void {
      loader.load().catch(() => {
        // Silent — preload should not throw
      });
    },

    getModule(): T | null {
      return module;
    },

    getError(): string | null {
      return error;
    },

    getLoadTimeMs(): number | null {
      return loadTimeMs;
    },
  };

  return loader;
}
