import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimationFrameThrottle } from '../useAnimationFrameThrottle';

// ---------------------------------------------------------------------------
// Mock requestAnimationFrame / cancelAnimationFrame / performance.now
// ---------------------------------------------------------------------------

let rafCallbacks: Array<FrameRequestCallback> = [];
let rafIdCounter = 0;
let mockNow = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafIdCounter = 0;
  mockNow = 0;

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafIdCounter;
    rafCallbacks.push(cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockImplementation(() => mockNow);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function flushRaf() {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of cbs) cb(mockNow);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAnimationFrameThrottle', () => {
  it('invokes callback on first call after flushing rAF', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useAnimationFrameThrottle(spy, 10));

    act(() => {
      result.current(42);
    });
    // Not yet called — waiting for rAF
    expect(spy).not.toHaveBeenCalled();

    act(() => flushRaf());
    expect(spy).toHaveBeenCalledWith(42);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('throttles rapid calls — only latest args are used', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useAnimationFrameThrottle(spy, 10));

    act(() => {
      result.current(1);
      result.current(2);
      result.current(3);
    });

    act(() => flushRaf());
    // Only the last args should be delivered
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('allows a second call after the throttle interval has elapsed', () => {
    const spy = vi.fn();
    // 10 fps = 100ms interval
    const { result } = renderHook(() => useAnimationFrameThrottle(spy, 10));

    // First call
    act(() => { result.current('a'); });
    act(() => flushRaf());
    expect(spy).toHaveBeenCalledTimes(1);

    // Advance past the interval
    mockNow = 150;

    // Second call
    act(() => { result.current('b'); });
    act(() => flushRaf());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('b');
  });

  it('defers call when within throttle interval, then fires on second rAF', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useAnimationFrameThrottle(spy, 10));

    // First call at t=0
    act(() => { result.current('first'); });
    act(() => flushRaf());
    expect(spy).toHaveBeenCalledTimes(1);

    // Second call at t=50 (within 100ms interval)
    mockNow = 50;
    act(() => { result.current('second'); });
    act(() => flushRaf()); // first rAF — too soon, schedules another
    // The callback may or may not have fired yet depending on the deferred rAF
    act(() => {
      mockNow = 160;
      flushRaf();
    }); // second rAF fires

    expect(spy).toHaveBeenCalledWith('second');
  });
});
