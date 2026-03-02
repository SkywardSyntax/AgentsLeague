import { describe, expect, it } from 'vitest';
import { createBackpressureController } from '@/lib/server/backpressure';
import type { AgentSSEEvent } from '@/types/agent';

function makeEvent(delta = 'x'): AgentSSEEvent {
  return { type: 'assistant.text.delta', turnId: 't1', delta };
}

describe('createBackpressureController', () => {
  it('returns object with offer, pressure, isPaused, drain', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 5,
      lowWaterMark: 2,
    });
    expect(typeof ctrl.offer).toBe('function');
    expect(typeof ctrl.pressure).toBe('function');
    expect(typeof ctrl.isPaused).toBe('function');
    expect(typeof ctrl.drain).toBe('function');
  });

  it('offer below highWaterMark returns true (accepted)', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 5,
      lowWaterMark: 2,
    });
    expect(ctrl.offer(makeEvent())).toBe(true);
  });

  it('offer at or above highWaterMark returns false (rejected)', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 2,
      lowWaterMark: 1,
    });
    ctrl.offer(makeEvent('a'));
    ctrl.offer(makeEvent('b'));
    // buffer is now at highWaterMark (2), next offer should be rejected
    expect(ctrl.offer(makeEvent('c'))).toBe(false);
  });

  it('isPaused returns false initially, true after exceeding highWaterMark', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 2,
      lowWaterMark: 1,
    });
    expect(ctrl.isPaused()).toBe(false);
    ctrl.offer(makeEvent('a'));
    ctrl.offer(makeEvent('b'));
    // buffer reached highWaterMark
    expect(ctrl.isPaused()).toBe(true);
  });

  it('onDrop callback fires for each rejected event with the dropped event payload', () => {
    const dropped: AgentSSEEvent[] = [];
    const ctrl = createBackpressureController({
      highWaterMark: 1,
      lowWaterMark: 0,
      onDrop: (e) => dropped.push(e),
    });
    ctrl.offer(makeEvent('a'));
    const rejected = makeEvent('b');
    ctrl.offer(rejected);
    expect(dropped).toEqual([rejected]);
  });

  it('drain returns all buffered events in insertion order', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 5,
      lowWaterMark: 2,
    });
    const events = [makeEvent('a'), makeEvent('b'), makeEvent('c')];
    events.forEach((e) => ctrl.offer(e));
    expect(ctrl.drain()).toEqual(events);
  });

  it('isPaused returns false after drain reduces buffer below lowWaterMark', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 2,
      lowWaterMark: 1,
    });
    ctrl.offer(makeEvent('a'));
    ctrl.offer(makeEvent('b'));
    expect(ctrl.isPaused()).toBe(true);
    ctrl.drain();
    expect(ctrl.isPaused()).toBe(false);
  });

  it('pressure returns 0 on empty buffer, 1.0 at highWaterMark', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 4,
      lowWaterMark: 1,
    });
    expect(ctrl.pressure()).toBe(0);
    ctrl.offer(makeEvent('a'));
    ctrl.offer(makeEvent('b'));
    ctrl.offer(makeEvent('c'));
    ctrl.offer(makeEvent('d'));
    expect(ctrl.pressure()).toBe(1);
  });

  it('pressure returns 0.5 when buffer is half of highWaterMark', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 4,
      lowWaterMark: 1,
    });
    ctrl.offer(makeEvent('a'));
    ctrl.offer(makeEvent('b'));
    expect(ctrl.pressure()).toBe(0.5);
  });

  it('offer after drain accepts events again (backpressure cycle resets)', () => {
    const ctrl = createBackpressureController({
      highWaterMark: 2,
      lowWaterMark: 1,
    });
    ctrl.offer(makeEvent('a'));
    ctrl.offer(makeEvent('b'));
    expect(ctrl.offer(makeEvent('c'))).toBe(false);
    ctrl.drain();
    expect(ctrl.offer(makeEvent('d'))).toBe(true);
    expect(ctrl.isPaused()).toBe(false);
  });
});
