import { describe, it, expect } from 'vitest';
import { validateTestConfig } from '@/lib/test-config';

describe('TestConfigSchema', () => {
  it('accepts a fully valid configuration', () => {
    const config = validateTestConfig({
      testTimeoutMs: 10000, parallelism: 8, retryCount: 3,
      bailThreshold: 5, coverageMinimum: 80, verbose: true,
    });
    expect(config.testTimeoutMs).toBe(10000);
    expect(config.parallelism).toBe(8);
    expect(config.verbose).toBe(true);
  });

  it('applies defaults when fields are omitted', () => {
    const config = validateTestConfig({});
    expect(config.testTimeoutMs).toBe(5000);
    expect(config.parallelism).toBe(4);
    expect(config.retryCount).toBe(0);
    expect(config.bailThreshold).toBe(0);
    expect(config.coverageMinimum).toBe(0);
    expect(config.verbose).toBe(false);
  });

  it('rejects timeout below 100ms', () => {
    expect(() => validateTestConfig({ testTimeoutMs: 50 })).toThrow();
  });

  it('rejects parallelism of zero', () => {
    expect(() => validateTestConfig({ parallelism: 0 })).toThrow();
  });

  it('rejects parallelism exceeding 32', () => {
    expect(() => validateTestConfig({ parallelism: 33 })).toThrow();
  });

  it('rejects negative retry count', () => {
    expect(() => validateTestConfig({ retryCount: -1 })).toThrow();
  });

  it('rejects retry count exceeding 10', () => {
    expect(() => validateTestConfig({ retryCount: 11 })).toThrow();
  });

  it('rejects coverage above 100', () => {
    expect(() => validateTestConfig({ coverageMinimum: 101 })).toThrow();
  });

  it('rejects NaN values', () => {
    expect(() => validateTestConfig({ testTimeoutMs: NaN })).toThrow();
    expect(() => validateTestConfig({ parallelism: NaN })).toThrow();
  });

  it('validates at exact boundary values', () => {
    const config = validateTestConfig({
      testTimeoutMs: 100, parallelism: 32, retryCount: 10,
      coverageMinimum: 100,
    });
    expect(config.testTimeoutMs).toBe(100);
    expect(config.parallelism).toBe(32);
    expect(config.retryCount).toBe(10);
    expect(config.coverageMinimum).toBe(100);
  });
});
