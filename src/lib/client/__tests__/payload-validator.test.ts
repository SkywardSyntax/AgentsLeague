import { describe, it, expect } from 'vitest';
import { validateDrawBatchPayload } from '../payload-validator';

function batch(elements: unknown[]) {
  return { batch_id: 'test-001', elements };
}

describe('validateDrawBatchPayload', () => {
  it('valid payload → no errors or warnings', () => {
    const result = validateDrawBatchPayload(batch([
      { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 },
    ]));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('unknown type → error with suggestion', () => {
    const result = validateDrawBatchPayload(batch([
      { id: 'fc1', type: 'function_curvee' },
    ]));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const typeErr = result.errors.find((e) => e.path.includes('.type'));
    expect(typeErr).toBeDefined();
    expect(typeErr!.message).toContain("Unknown element type 'function_curvee'");
    expect(typeErr!.suggestion).toContain('function_curve');
  });

  it('missing required field → error with field name', () => {
    const result = validateDrawBatchPayload(batch([
      { id: 'fc1', type: 'function_curve', x: 0, y: 0, width: 100, height: 100, xRange: [-5, 5], yRange: [-5, 5] },
    ]));
    expect(result.valid).toBe(false);
    const exprErr = result.errors.find((e) => e.path.includes('expression'));
    expect(exprErr).toBeDefined();
    expect(exprErr!.message).toContain("requires field 'expression'");
    expect(exprErr!.message).toContain('string');
  });

  it('off-canvas coords → warning', () => {
    const result = validateDrawBatchPayload(batch([
      { id: 'r1', type: 'rect', x: 2000, y: 20, w: 100, h: 50 },
    ]));
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    const warn = result.warnings.find((w) => w.path.includes('.x'));
    expect(warn).toBeDefined();
    expect(warn!.message).toContain('off-canvas');
    expect(warn!.message).toContain('x=2000');
  });

  it('number_theory_grid n>20 → warning', () => {
    const result = validateDrawBatchPayload(batch([
      { id: 'ntg1', type: 'number_theory_grid', n: 25, highlights: [], cx: 100, cy: 100 },
    ]));
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    const warn = result.warnings.find((w) => w.path.includes('.n'));
    expect(warn).toBeDefined();
    expect(warn!.message).toContain('n=25');
    expect(warn!.message).toContain('n≤20');
  });

  it('non-object payload → error', () => {
    const result = validateDrawBatchPayload('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('JSON object');
  });

  it('missing batch_id → error', () => {
    const result = validateDrawBatchPayload({ elements: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 1, h: 1 }] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'batch_id')).toBe(true);
  });

  it('wrong field type → error', () => {
    const result = validateDrawBatchPayload(batch([
      { id: 'r1', type: 'rect', x: 'hello', y: 20, w: 100, h: 50 },
    ]));
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.path.includes('.x'));
    expect(err).toBeDefined();
    expect(err!.message).toContain('must be number');
  });

  it('negative canvas coords → warning', () => {
    const result = validateDrawBatchPayload(batch([
      { id: 'r1', type: 'text', x: -200, y: 10, text: 'hello' },
    ]));
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0].message).toContain('off-canvas');
  });
});
