export interface IsolationViolation {
  path: string;
  reason: string;
}

function isDeepFrozen(obj: unknown, path: string, violations: IsolationViolation[]): void {
  if (obj === null || obj === undefined || typeof obj !== 'object') return;

  if (!Object.isFrozen(obj)) {
    violations.push({ path, reason: 'mutable object (not frozen)' });
    return;
  }

  // Check children even if parent is frozen (shallow freeze detection)
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const child = (obj as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object') {
      if (!Object.isFrozen(child)) {
        violations.push({
          path: `${path}.${key}`,
          reason: 'nested mutable object (shallow freeze)',
        });
      }
    }
  }
}

export function assertNoSharedMutable(
  value: unknown,
  name = 'export',
): IsolationViolation[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'function') return [];
  if (typeof value !== 'object') return []; // primitives are safe

  const violations: IsolationViolation[] = [];

  if (Array.isArray(value)) {
    if (!Object.isFrozen(value)) {
      violations.push({ path: name, reason: 'mutable array' });
    }
    return violations;
  }

  isDeepFrozen(value, name, violations);
  return violations;
}

export function createIsolatedContext<T>(factory: () => T): () => T {
  return () => factory();
}
