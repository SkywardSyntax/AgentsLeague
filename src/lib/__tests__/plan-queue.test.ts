import { describe, it, expect, vi } from 'vitest';
import { createPlanQueue } from '@/lib/whiteboard/planner/plan-queue';

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

describe('plan queue', () => {
  it('single plan request resolves normally', async () => {
    const queue = createPlanQueue<string>();
    const result = await queue.enqueue(() => Promise.resolve('plan-A'));
    expect(result).toBe('plan-A');
  });

  it('second request cancels the first', async () => {
    const queue = createPlanQueue<string>();
    const p1 = queue.enqueue(async (signal) => {
      await delay(50);
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      return 'plan-A';
    });
    const p2 = queue.enqueue(() => Promise.resolve('plan-B'));
    await expect(p1).rejects.toThrow();
    expect(await p2).toBe('plan-B');
  });

  it('cancelled request rejects with AbortError', async () => {
    const queue = createPlanQueue<string>();
    const p1 = queue.enqueue(async (signal) => {
      await delay(50);
      if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
      return 'plan-A';
    });
    queue.enqueue(() => Promise.resolve('plan-B'));
    try {
      await p1;
    } catch (err) {
      expect((err as DOMException).name).toBe('AbortError');
    }
  });

  it('only latest result is kept', async () => {
    const queue = createPlanQueue<number>();
    queue.enqueue(async (signal) => {
      await delay(50);
      if (signal.aborted) throw new DOMException('', 'AbortError');
      return 1;
    });
    const p2 = queue.enqueue(() => Promise.resolve(2));
    expect(await p2).toBe(2);
  });

  it('reports isPlanning status', async () => {
    const queue = createPlanQueue<string>();
    expect(queue.isPlanning()).toBe(false);
    const p = queue.enqueue(() => delay(30).then(() => 'done'));
    expect(queue.isPlanning()).toBe(true);
    await p;
    expect(queue.isPlanning()).toBe(false);
  });

  it('rapid triple-enqueue — only third resolves', async () => {
    const queue = createPlanQueue<number>();
    const p1 = queue.enqueue(async (signal) => {
      await delay(50);
      if (signal.aborted) throw new DOMException('', 'AbortError');
      return 1;
    });
    const p2 = queue.enqueue(async (signal) => {
      await delay(50);
      if (signal.aborted) throw new DOMException('', 'AbortError');
      return 2;
    });
    const p3 = queue.enqueue(() => Promise.resolve(3));
    await expect(p1).rejects.toThrow();
    await expect(p2).rejects.toThrow();
    expect(await p3).toBe(3);
  });

  it('after cancel, queue accepts new work', async () => {
    const queue = createPlanQueue<string>();
    const stale = queue.enqueue(async (signal) => {
      await delay(100);
      if (signal.aborted) throw new DOMException('', 'AbortError');
      return 'old';
    });
    queue.cancel();
    // Ensure stale promise is handled
    await expect(stale).rejects.toThrow();
    const result = await queue.enqueue(() => Promise.resolve('new'));
    expect(result).toBe('new');
  });

  it('error in plan function surfaces correctly', async () => {
    const queue = createPlanQueue<string>();
    await expect(
      queue.enqueue(() => Promise.reject(new Error('plan failed'))),
    ).rejects.toThrow('plan failed');
  });

  it('concurrent enqueue from same tick — last wins', async () => {
    const queue = createPlanQueue<number>();
    const fn = vi.fn();
    const p1 = queue.enqueue(async (signal) => {
      await delay(20);
      if (signal.aborted) throw new DOMException('', 'AbortError');
      fn();
      return 1;
    });
    const p2 = queue.enqueue(() => Promise.resolve(2));
    await expect(p1).rejects.toThrow();
    expect(await p2).toBe(2);
    expect(fn).not.toHaveBeenCalled();
  });

  it('abort signal is passed to plan function', async () => {
    const queue = createPlanQueue<string>();
    let receivedSignal: AbortSignal | null = null;
    const p = queue.enqueue(async (signal) => {
      receivedSignal = signal;
      await delay(100);
      if (signal.aborted) throw new DOMException('', 'AbortError');
      return 'done';
    });
    queue.cancel();
    await expect(p).rejects.toThrow();
    expect(receivedSignal).not.toBeNull();
    expect(receivedSignal!.aborted).toBe(true);
  });
});
