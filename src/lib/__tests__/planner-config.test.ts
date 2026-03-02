import { describe, it, expect } from 'vitest';
import { validatePlannerConfig } from '@/lib/agent/planner-config';

describe('PlannerConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validatePlannerConfig({
      maxSteps: 200, maxDepth: 15, timeoutMs: 60000,
      strategy: 'breadth-first', temperature: 1.0,
    });
    expect(config.maxSteps).toBe(200);
    expect(config.strategy).toBe('breadth-first');
  });

  it('applies defaults for all optional fields', () => {
    const config = validatePlannerConfig({});
    expect(config.maxSteps).toBe(100);
    expect(config.maxDepth).toBe(10);
    expect(config.timeoutMs).toBe(30000);
    expect(config.strategy).toBe('adaptive');
    expect(config.temperature).toBe(0.7);
    expect(config.enableLogging).toBe(false);
  });

  it('rejects invalid strategy values', () => {
    expect(() => validatePlannerConfig({ strategy: 'random-walk' })).toThrow();
  });

  it('rejects maxSteps outside 1–1000 range', () => {
    expect(() => validatePlannerConfig({ maxSteps: 0 })).toThrow();
    expect(() => validatePlannerConfig({ maxSteps: 1001 })).toThrow();
  });

  it('rejects maxDepth exceeding 50', () => {
    expect(() => validatePlannerConfig({ maxDepth: 51 })).toThrow();
  });

  it('rejects negative timeout', () => {
    expect(() => validatePlannerConfig({ timeoutMs: -1 })).toThrow();
  });

  it('rejects timeout below minimum', () => {
    expect(() => validatePlannerConfig({ timeoutMs: 50 })).toThrow();
  });

  it('rejects temperature above 2', () => {
    expect(() => validatePlannerConfig({ temperature: 2.5 })).toThrow();
  });

  it('strips extra fields not in schema', () => {
    const config = validatePlannerConfig({ unknownField: 'hello' } as Record<string, unknown>);
    expect((config as Record<string, unknown>)['unknownField']).toBeUndefined();
  });

  it('allows partial override while keeping other defaults', () => {
    const config = validatePlannerConfig({ maxSteps: 50, strategy: 'depth-first' });
    expect(config.maxSteps).toBe(50);
    expect(config.strategy).toBe('depth-first');
    expect(config.maxDepth).toBe(10);
    expect(config.temperature).toBe(0.7);
  });
});
