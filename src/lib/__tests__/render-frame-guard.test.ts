import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFrameGuard } from '@/lib/whiteboard/render-frame-guard';

// Mock requestAnimationFrame / cancelAnimationFrame
let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

beforeEach(() => {
  rafCallbacks = new Map();
  nextRafId = 1;

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
  });

  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id);
  });
});

function flushRAF() {
  const cbs = Array.from(rafCallbacks.entries());
  rafCallbacks.clear();
  for (const [, cb] of cbs) {
    cb(performance.now());
  }
}

describe('render frame guard', () => {
  it('single frame executes normally', () => {
    const guard = createFrameGuard();
    const fn = vi.fn();
    guard.schedule(fn);
    flushRAF();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('rapid schedule replaces pending frame — only last runs', () => {
    const guard = createFrameGuard();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    guard.schedule(fn1);
    guard.schedule(fn2);
    flushRAF();
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('reports isPending correctly', () => {
    const guard = createFrameGuard();
    expect(guard.isPending()).toBe(false);
    guard.schedule(vi.fn());
    expect(guard.isPending()).toBe(true);
    flushRAF();
    expect(guard.isPending()).toBe(false);
  });

  it('cancel prevents pending frame', () => {
    const guard = createFrameGuard();
    const fn = vi.fn();
    guard.schedule(fn);
    guard.cancel();
    flushRAF();
    expect(fn).not.toHaveBeenCalled();
    expect(guard.isPending()).toBe(false);
  });

  it('callback receives frame ID', () => {
    const guard = createFrameGuard();
    const fn = vi.fn();
    const id = guard.schedule(fn);
    flushRAF();
    expect(fn).toHaveBeenCalledWith(id);
  });

  it('double-cancel is safe (idempotent)', () => {
    const guard = createFrameGuard();
    guard.schedule(vi.fn());
    guard.cancel();
    expect(() => guard.cancel()).not.toThrow();
    expect(guard.isPending()).toBe(false);
  });

  it('after cancel, new schedule works', () => {
    const guard = createFrameGuard();
    guard.schedule(vi.fn());
    guard.cancel();
    const fn = vi.fn();
    guard.schedule(fn);
    flushRAF();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('guard recovers if callback throws', () => {
    const guard = createFrameGuard();
    guard.schedule(() => { throw new Error('boom'); });
    expect(() => flushRAF()).toThrow('boom');
    // Should still accept new frames
    const fn = vi.fn();
    guard.schedule(fn);
    flushRAF();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('concurrent schedules — only highest ID wins', () => {
    const guard = createFrameGuard();
    const calls: number[] = [];
    guard.schedule((id) => calls.push(id));
    guard.schedule((id) => calls.push(id));
    guard.schedule((id) => calls.push(id));
    flushRAF();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(guard.currentFrameId());
  });

  it('frame counter increments monotonically', () => {
    const guard = createFrameGuard();
    const id1 = guard.schedule(vi.fn());
    flushRAF();
    const id2 = guard.schedule(vi.fn());
    flushRAF();
    const id3 = guard.schedule(vi.fn());
    flushRAF();
    expect(id1).toBeLessThan(id2);
    expect(id2).toBeLessThan(id3);
  });
});
