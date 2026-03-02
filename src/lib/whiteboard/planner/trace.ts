export interface PlannerTraceEvent {
  phase: 'validate' | 'template' | 'region' | 'constrain' | 'lower';
  label: string;
  ts: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
}

const VALID_PHASES = new Set<PlannerTraceEvent['phase']>(['validate', 'template', 'region', 'constrain', 'lower']);

export interface PlannerTraceContext {
  enabled: boolean;
  events: PlannerTraceEvent[];
  push(event: Omit<PlannerTraceEvent, 'ts'>): void;
  span<T>(phase: PlannerTraceEvent['phase'], label: string, fn: () => T): T;
}

export function createPlannerTrace(enabled = false): PlannerTraceContext {
  const events: PlannerTraceEvent[] = [];

  if (!enabled) {
    return {
      enabled: false,
      events,
      push() { /* no-op */ },
      span<T>(_phase: PlannerTraceEvent['phase'], _label: string, fn: () => T): T {
        return fn();
      },
    };
  }

  return {
    enabled: true,
    events,
    push(event: Omit<PlannerTraceEvent, 'ts'>) {
      if (!VALID_PHASES.has(event.phase)) {
        throw new Error(`Invalid phase: ${event.phase}`);
      }
      events.push({ ...event, ts: performance.now() });
    },
    span<T>(phase: PlannerTraceEvent['phase'], label: string, fn: () => T): T {
      if (!VALID_PHASES.has(phase)) {
        throw new Error(`Invalid phase: ${phase}`);
      }
      const start = performance.now();
      let result: T;
      try {
        result = fn();
      } catch (err) {
        const end = performance.now();
        events.push({ phase, label, ts: start, durationMs: end - start });
        throw err;
      }
      const end = performance.now();
      events.push({ phase, label, ts: start, durationMs: end - start, output: result });
      return result;
    },
  };
}

export function formatPlannerTrace(events: PlannerTraceEvent[]): string {
  if (events.length === 0) return 'Planner trace: no events recorded.';

  const lines = events.map((e, i) => {
    const duration = e.durationMs !== undefined ? ` (${e.durationMs.toFixed(2)}ms)` : '';
    return `[${i + 1}] ${e.phase}: ${e.label}${duration}`;
  });

  return `Planner trace: ${events.length} event(s)\n${lines.join('\n')}`;
}
