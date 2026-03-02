import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCircuitBreaker,
  CircuitOpenError,
} from '../client/circuit-breaker';

describe('circuit-breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test 1
  it('createCircuitBreaker returns object with execute, state, stats, reset', () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
    });
    expect(typeof breaker.execute).toBe('function');
    expect(typeof breaker.state).toBe('function');
    expect(typeof breaker.stats).toBe('function');
    expect(typeof breaker.reset).toBe('function');
  });

  // Test 2
  it("state() is 'closed' initially", () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
    });
    expect(breaker.state()).toBe('closed');
  });

  // Test 3
  it("execute(fn) passes through fn's return value when fn succeeds", async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
    });
    const result = await breaker.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  // Test 4
  it("after failureThreshold consecutive failures, state() becomes 'open'", async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
    });
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    expect(breaker.state()).toBe('open');
  });

  // Test 5
  it('in open state, execute(fn) rejects with CircuitOpenError without calling fn', async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5000,
    });
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

    const fn = vi.fn(() => Promise.resolve('ok'));
    await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  // Test 6
  it("CircuitOpenError.name is 'CircuitOpenError'", () => {
    const err = new CircuitOpenError();
    expect(err.name).toBe('CircuitOpenError');
  });

  // Test 7
  it("after resetTimeoutMs elapses, state() becomes 'half-open'", async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5000,
    });
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(breaker.state()).toBe('open');

    vi.advanceTimersByTime(5000);
    expect(breaker.state()).toBe('half-open');
  });

  // Test 8
  it("success during half-open transitions state back to 'closed'", async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5000,
    });
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    vi.advanceTimersByTime(5000);
    expect(breaker.state()).toBe('half-open');

    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.state()).toBe('closed');
  });

  // Test 9
  it("failure during half-open transitions state back to 'open'", async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5000,
    });
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    vi.advanceTimersByTime(5000);
    expect(breaker.state()).toBe('half-open');

    await breaker.execute(() => Promise.reject(new Error('fail again'))).catch(() => {});
    expect(breaker.state()).toBe('open');
  });

  // Test 10
  it('stats() accurately reflects successes, failures, rejections counts', async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 5000,
    });

    await breaker.execute(() => Promise.resolve('ok'));
    await breaker.execute(() => Promise.reject(new Error('f1'))).catch(() => {});
    await breaker.execute(() => Promise.reject(new Error('f2'))).catch(() => {});
    // Now open — next call is rejected
    await breaker.execute(() => Promise.resolve('ignored')).catch(() => {});

    const stats = breaker.stats();
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(2);
    expect(stats.rejections).toBe(1);
  });

  // Test 11
  it("reset() returns state to 'closed' and zeroes all counters", async () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5000,
    });
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(breaker.state()).toBe('open');

    breaker.reset();
    expect(breaker.state()).toBe('closed');
    const stats = breaker.stats();
    expect(stats.successes).toBe(0);
    expect(stats.failures).toBe(0);
    expect(stats.rejections).toBe(0);
    expect(stats.lastFailureTime).toBeNull();
  });
});
