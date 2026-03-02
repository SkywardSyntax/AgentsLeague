/**
 * Detect corrupted session state and auto-recover to the last known good snapshot.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RecoveryResult<T> {
  recovered: boolean;
  state: T | null;
  errors?: string[];
}

export interface StateRecoveryGuard<T> {
  checkpoint: (state: T) => void;
  tryRecover: (state: T) => RecoveryResult<T>;
  lastGoodState: () => T | null;
}

export interface StateRecoveryOptions<T> {
  validate: (state: T) => ValidationResult;
  maxSnapshots?: number;
}

const VALID_DRAW_ELEMENT_TYPES = new Set([
  'rect',
  'ellipse',
  'line',
  'arrow',
  'text',
  'latex',
  'clear',
]);

const VALID_APP_STATUSES = new Set([
  'idle',
  'thinking',
  'streaming',
  'drawing',
]);

export function validateChatSessionState(state: unknown): ValidationResult {
  const errors: string[] = [];
  if (!state || typeof state !== 'object') {
    return { valid: false, errors: ['State is not an object'] };
  }

  const s = state as Record<string, unknown>;

  if (!Array.isArray(s.messages)) {
    errors.push('messages field is missing or not an array');
  }

  if (Array.isArray(s.scene)) {
    for (const el of s.scene) {
      if (
        !el ||
        typeof el !== 'object' ||
        !VALID_DRAW_ELEMENT_TYPES.has((el as Record<string, unknown>).type as string)
      ) {
        errors.push(
          `Invalid DrawElement type: ${(el as Record<string, unknown>)?.type ?? 'undefined'}`,
        );
      }
    }
  }

  if (s.status !== undefined && !VALID_APP_STATUSES.has(s.status as string)) {
    errors.push(`Invalid status: ${s.status}`);
  }

  return { valid: errors.length === 0, errors };
}

export function createStateRecoveryGuard<T>(
  opts: StateRecoveryOptions<T>,
): StateRecoveryGuard<T> {
  const maxSnapshots = opts.maxSnapshots ?? 3;
  const snapshots: T[] = [];

  function deepCopy(state: T): T {
    return JSON.parse(JSON.stringify(state));
  }

  function checkpoint(state: T): void {
    snapshots.push(deepCopy(state));
    while (snapshots.length > maxSnapshots) {
      snapshots.shift();
    }
  }

  function tryRecover(state: T): RecoveryResult<T> {
    const result = opts.validate(state);
    if (result.valid) {
      return { recovered: false, state };
    }

    const lastGood = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    return {
      recovered: lastGood !== null,
      state: lastGood,
      errors: result.errors,
    };
  }

  function lastGoodState(): T | null {
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }

  return { checkpoint, tryRecover, lastGoodState };
}
