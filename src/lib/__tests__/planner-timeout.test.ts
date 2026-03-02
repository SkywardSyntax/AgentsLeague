import { describe, it, expect, vi } from 'vitest';
import {
  withPlannerTimeout,
  PlannerTimeoutError,
} from '@/lib/whiteboard/planner/timeout';

describe('planner-timeout', () => {
  // Test 1
  it('resolves with the function return value when it completes within the deadline', async () => {
    const result = await withPlannerTimeout(
      async () => 'done',
      { timeoutMs: 1000 },
    );
    expect(result).toBe('done');
  });

  // Test 2
  it('rejects with PlannerTimeoutError when function exceeds timeoutMs', async () => {
    await expect(
      withPlannerTimeout(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
        { timeoutMs: 10 },
      ),
    ).rejects.toThrow(PlannerTimeoutError);
  });

  // Test 3
  it('PlannerTimeoutError.timeoutMs matches the configured timeout value', async () => {
    try {
      await withPlannerTimeout(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
        { timeoutMs: 42 },
      );
    } catch (e) {
      expect(e).toBeInstanceOf(PlannerTimeoutError);
      expect((e as PlannerTimeoutError).timeoutMs).toBe(42);
    }
  });

  // Test 4
  it("PlannerTimeoutError.name is 'PlannerTimeoutError'", () => {
    const err = new PlannerTimeoutError(100);
    expect(err.name).toBe('PlannerTimeoutError');
  });

  // Test 5
  it('onTimeout callback is called with elapsed time when timeout fires', async () => {
    const onTimeout = vi.fn();
    await expect(
      withPlannerTimeout(
        () => new Promise((resolve) => setTimeout(resolve, 500)),
        { timeoutMs: 10, onTimeout },
      ),
    ).rejects.toThrow(PlannerTimeoutError);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });

  // Test 6
  it('onTimeout is not called when function completes within deadline', async () => {
    const onTimeout = vi.fn();
    await withPlannerTimeout(async () => 'ok', { timeoutMs: 1000, onTimeout });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  // Test 7
  it('AbortSignal passed to wrapped function is aborted after timeout', async () => {
    let receivedSignal: AbortSignal | undefined;
    try {
      await withPlannerTimeout(
        async (signal) => {
          receivedSignal = signal;
          await new Promise((resolve) => setTimeout(resolve, 500));
        },
        { timeoutMs: 10 },
      );
    } catch {
      // expected
    }
    expect(receivedSignal!.aborted).toBe(true);
  });

  // Test 8
  it('AbortSignal is not aborted when function completes within deadline', async () => {
    let receivedSignal: AbortSignal | undefined;
    await withPlannerTimeout(
      async (signal) => {
        receivedSignal = signal;
        return 'ok';
      },
      { timeoutMs: 1000 },
    );
    expect(receivedSignal!.aborted).toBe(false);
  });

  // Test 9
  it('withPlannerTimeout with timeoutMs: 0 rejects immediately with PlannerTimeoutError', async () => {
    await expect(
      withPlannerTimeout(
        async () => 'should not resolve',
        { timeoutMs: 0 },
      ),
    ).rejects.toThrow(PlannerTimeoutError);
  });

  // Test 10
  it('function rejection (non-timeout) propagates as-is without wrapping in PlannerTimeoutError', async () => {
    const originalError = new Error('custom failure');
    await expect(
      withPlannerTimeout(
        async () => { throw originalError; },
        { timeoutMs: 1000 },
      ),
    ).rejects.toBe(originalError);
  });
});
