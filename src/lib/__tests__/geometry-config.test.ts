import { describe, it, expect } from 'vitest';
import { validateGeometryConfig } from '@/lib/math/geometry-config';

describe('GeometryConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateGeometryConfig({
      coordinateLimit: 50000, precisionDigits: 8,
      epsilon: 1e-8, maxVertices: 5000, angleUnit: 'degrees',
    });
    expect(config.coordinateLimit).toBe(50000);
    expect(config.angleUnit).toBe('degrees');
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateGeometryConfig({});
    expect(config.coordinateLimit).toBe(1e5);
    expect(config.precisionDigits).toBe(10);
    expect(config.epsilon).toBe(1e-10);
    expect(config.maxVertices).toBe(10000);
    expect(config.angleUnit).toBe('radians');
  });

  it('rejects coordinate limit exceeding 1e6', () => {
    expect(() => validateGeometryConfig({ coordinateLimit: 2e6 })).toThrow();
  });

  it('rejects negative precision digits', () => {
    expect(() => validateGeometryConfig({ precisionDigits: -1 })).toThrow();
  });

  it('rejects precision digits exceeding 20', () => {
    expect(() => validateGeometryConfig({ precisionDigits: 21 })).toThrow();
  });

  it('rejects epsilon below 1e-15', () => {
    expect(() => validateGeometryConfig({ epsilon: 1e-16 })).toThrow();
  });

  it('rejects epsilon above 0.1', () => {
    expect(() => validateGeometryConfig({ epsilon: 0.5 })).toThrow();
  });

  it('rejects maxVertices below 3', () => {
    expect(() => validateGeometryConfig({ maxVertices: 2 })).toThrow();
    expect(() => validateGeometryConfig({ maxVertices: 0 })).toThrow();
  });

  it('rejects invalid angle unit', () => {
    expect(() => validateGeometryConfig({ angleUnit: 'gradians' })).toThrow();
  });

  it('validates at exact boundary values', () => {
    const config = validateGeometryConfig({
      coordinateLimit: 1e6, precisionDigits: 0, epsilon: 1e-15,
      maxVertices: 3,
    });
    expect(config.coordinateLimit).toBe(1e6);
    expect(config.precisionDigits).toBe(0);
    expect(config.maxVertices).toBe(3);
  });
});
