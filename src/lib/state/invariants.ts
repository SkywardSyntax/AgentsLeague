/**
 * State invariant checks — runtime invariant assertions for state transitions.
 */

export class InvariantViolation extends Error {
  readonly invariantName: string;
  readonly previousState: unknown;
  readonly nextState: unknown;

  constructor(invariantName: string, message: string, previousState?: unknown, nextState?: unknown) {
    super(`Invariant "${invariantName}" violated: ${message}`);
    this.name = 'InvariantViolation';
    this.invariantName = invariantName;
    this.previousState = previousState;
    this.nextState = nextState;
  }
}

export function assertInvariant(condition: boolean, name: string, message?: string): void {
  if (!condition) {
    throw new InvariantViolation(name, message ?? 'assertion failed');
  }
}

export type InvariantChecker<S> = (prev: S, next: S) => string | null;

export interface TransitionResult {
  valid: boolean;
  violations: string[];
}

export function defineInvariant<S>(
  name: string,
  check: (prev: S, next: S) => boolean,
  message?: string,
): InvariantChecker<S> {
  return (prev, next) => {
    if (!check(prev, next)) {
      return `${name}: ${message ?? 'invariant failed'}`;
    }
    return null;
  };
}

export function composeInvariants<S>(...checkers: InvariantChecker<S>[]): InvariantChecker<S> {
  return (prev, next) => {
    for (const checker of checkers) {
      const violation = checker(prev, next);
      if (violation !== null) return violation;
    }
    return null;
  };
}

export function checkStateTransition<S>(
  prev: S,
  next: S,
  invariants: InvariantChecker<S>[],
): TransitionResult {
  const violations: string[] = [];
  for (const checker of invariants) {
    const result = checker(prev, next);
    if (result !== null) violations.push(result);
  }
  return { valid: violations.length === 0, violations };
}

export async function checkStateTransitionAsync<S>(
  prev: S,
  next: S,
  validators: Array<(prev: S, next: S) => Promise<string | null>>,
): Promise<TransitionResult> {
  const results = await Promise.all(validators.map((v) => v(prev, next)));
  const violations = results.filter((r): r is string => r !== null);
  return { valid: violations.length === 0, violations };
}
