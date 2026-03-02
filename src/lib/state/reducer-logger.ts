export interface ReducerLogEntry {
  ts: number;
  action: { type: string; [key: string]: unknown };
  stateBefore: Record<string, unknown>;
  stateAfter: Record<string, unknown>;
  durationMs: number;
  stateChanged: boolean;
}

export interface ReducerLogger {
  enabled: boolean;
  entries: ReducerLogEntry[];
  wrap<S, A extends { type: string }>(
    reducer: (state: S, action: A) => S
  ): (state: S, action: A) => S;
  snapshot(): ReducerLogEntry[];
  clear(): void;
}

function defaultSnapshotFn(state: unknown): Record<string, unknown> {
  if (state === null || state === undefined || typeof state !== 'object') {
    return { value: state };
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(state as Record<string, unknown>)) {
    result[key] = (state as Record<string, unknown>)[key];
  }
  return result;
}

export function createReducerLogger(opts?: {
  maxEntries?: number;
  snapshotFn?: (state: unknown) => Record<string, unknown>;
}): ReducerLogger {
  const maxEntries = opts?.maxEntries ?? 200;
  const snapshotFn = opts?.snapshotFn ?? defaultSnapshotFn;

  const logger: ReducerLogger = {
    enabled: false,
    entries: [],

    wrap<S, A extends { type: string }>(
      reducer: (state: S, action: A) => S
    ): (state: S, action: A) => S {
      return (state: S, action: A): S => {
        if (!logger.enabled) {
          return reducer(state, action);
        }

        const stateBefore = snapshotFn(state);
        const startTs = performance.now();
        const newState = reducer(state, action);
        const endTs = performance.now();
        const stateAfter = snapshotFn(newState);

        const entry: ReducerLogEntry = {
          ts: Date.now(),
          action: action as { type: string; [key: string]: unknown },
          stateBefore,
          stateAfter,
          durationMs: endTs - startTs,
          stateChanged: state !== newState,
        };

        logger.entries.push(entry);
        if (logger.entries.length > maxEntries) {
          logger.entries.splice(0, logger.entries.length - maxEntries);
        }

        return newState;
      };
    },

    snapshot(): ReducerLogEntry[] {
      return [...logger.entries];
    },

    clear(): void {
      logger.entries.length = 0;
    },
  };

  return logger;
}
