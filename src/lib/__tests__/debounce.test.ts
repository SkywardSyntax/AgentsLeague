import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid calls into a single invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);

    debounced();
    debounced();
    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() fires the pending call immediately', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);

    debounced('arg1');
    debounced.flush();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('arg1');

    // No duplicate fire after timer elapses
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents pending invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(600);

    expect(fn).not.toHaveBeenCalled();
  });

  it('handles successive debounce windows independently', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);

    debounced();
    vi.advanceTimersByTime(600);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced();
    vi.advanceTimersByTime(600);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes the latest arguments to the callback', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced('a');
    debounced('b');
    debounced('c');

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('flush() is a no-op when nothing is pending', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('ms = 0 fires exactly once after timers advance', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 0);

    debounced('x');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('x');
  });

  it('flush() immediately after debounced() with ms = 0 fires exactly once', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 0);

    debounced('y');
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('y');

    // Advancing timers should not cause a second invocation
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() then flush() is a no-op', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced('a');
    debounced.cancel();
    debounced.flush();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rapid sequence: debounced → cancel → debounced → flush fires once with latest args', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced('a');
    debounced.cancel();
    debounced('b');
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');

    // No lingering timers
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ms = -1 does not crash and fn still fires', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, -1);

    debounced('neg');
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('neg');
  });
});
