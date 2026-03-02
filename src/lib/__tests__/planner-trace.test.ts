import { describe, it, expect } from 'vitest';
import { createPlannerTrace, formatPlannerTrace } from '../whiteboard/planner/trace';

describe('Planner Tracing', () => {
  it('disabled trace context produces no events', () => {
    const trace = createPlannerTrace(false);
    trace.push({ phase: 'validate', label: 'test' });
    trace.push({ phase: 'template', label: 'test2' });
    expect(trace.events).toHaveLength(0);
    expect(trace.enabled).toBe(false);
  });

  it('enabled trace records pushed events with timestamps', () => {
    const trace = createPlannerTrace(true);
    trace.push({ phase: 'validate', label: 'input-check' });
    trace.push({ phase: 'template', label: 'select-template' });
    expect(trace.events).toHaveLength(2);
    expect(trace.events[0]!.ts).toBeGreaterThan(0);
    expect(trace.events[1]!.ts).toBeGreaterThan(0);
    expect(trace.events[0]!.phase).toBe('validate');
    expect(trace.events[1]!.phase).toBe('template');
  });

  it('span() records duration of synchronous work', () => {
    const trace = createPlannerTrace(true);
    trace.span('validate', 'sync-work', () => {
      // Simulate some work
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      return sum;
    });
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof trace.events[0]!.durationMs).toBe('number');
  });

  it('span() captures return value as output', () => {
    const trace = createPlannerTrace(true);
    const result = trace.span('template', 'compute', () => 42);
    expect(result).toBe(42);
    expect(trace.events[0]!.output).toBe(42);
  });

  it('span() still records if the wrapped function throws', () => {
    const trace = createPlannerTrace(true);
    expect(() => {
      trace.span('constrain', 'fail-work', () => {
        throw new Error('boom');
      });
    }).toThrow('boom');
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(trace.events[0]!.output).toBeUndefined();
  });

  it('phase values are validated at runtime', () => {
    const trace = createPlannerTrace(true);
    expect(() => {
      trace.push({ phase: 'invalid' as any, label: 'test' });
    }).toThrow('Invalid phase');
    expect(() => {
      trace.span('bogus' as any, 'test', () => 1);
    }).toThrow('Invalid phase');
  });

  it('formatPlannerTrace() renders a readable timeline', () => {
    const trace = createPlannerTrace(true);
    trace.span('validate', 'check-input', () => 'ok');
    trace.span('template', 'select', () => 'tmpl');
    const output = formatPlannerTrace(trace.events);
    expect(output).toContain('2 event(s)');
    expect(output).toContain('validate');
    expect(output).toContain('template');
    expect(output).toContain('check-input');
    expect(output).toContain('ms');
  });

  it('formatPlannerTrace() handles empty events array', () => {
    const output = formatPlannerTrace([]);
    expect(output).toContain('no events');
  });

  it('trace events are ordered by timestamp', () => {
    const trace = createPlannerTrace(true);
    trace.push({ phase: 'validate', label: 'first' });
    trace.push({ phase: 'template', label: 'second' });
    trace.push({ phase: 'region', label: 'third' });
    for (let i = 1; i < trace.events.length; i++) {
      expect(trace.events[i]!.ts).toBeGreaterThanOrEqual(trace.events[i - 1]!.ts);
    }
  });

  it('disabled trace span() still executes the function', () => {
    const trace = createPlannerTrace(false);
    let executed = false;
    const result = trace.span('lower', 'run', () => {
      executed = true;
      return 'value';
    });
    expect(executed).toBe(true);
    expect(result).toBe('value');
    expect(trace.events).toHaveLength(0);
  });
});
