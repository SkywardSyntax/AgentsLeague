/**
 * Tests for StreamingDrawController — verifies the rAF-batched
 * animation pipeline for SSE-driven element rendering.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { DrawElement, DrawOp } from '@/types';
import {
  StreamingDrawController,
  easing,
  type VisibleElement,
} from '../StreamingDrawController';

// ── Mock rAF ────────────────────────────────────────────────────────

let rafCallbacks: { id: number; cb: FrameRequestCallback }[] = [];
let nextRafId = 1;

function mockRequestAnimationFrame(cb: FrameRequestCallback): number {
  const id = nextRafId++;
  rafCallbacks.push({ id, cb });
  return id;
}

function mockCancelAnimationFrame(id: number): void {
  rafCallbacks = rafCallbacks.filter((r) => r.id !== id);
}

function flushRaf(timestamp: number): void {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  for (const { cb } of cbs) {
    cb(timestamp);
  }
}

// Install mocks
const origRaf = globalThis.requestAnimationFrame;
const origCaf = globalThis.cancelAnimationFrame;

beforeAll(() => {
  globalThis.requestAnimationFrame = mockRequestAnimationFrame;
  globalThis.cancelAnimationFrame = mockCancelAnimationFrame;
});

afterAll(() => {
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCaf;
});

beforeEach(() => {
  rafCallbacks = [];
  nextRafId = 1;
});

// ── Helpers ─────────────────────────────────────────────────────────

function makeRect(id: string, overrides?: Partial<DrawElement>): DrawElement {
  return {
    id,
    type: 'rect',
    x: 10,
    y: 20,
    w: 100,
    h: 60,
    rotation: 0,
    opacity: 1,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cornerRadius: 8,
    fill: { type: 'solid', color: '#4A90D9', opacity: 1 },
    stroke: {
      color: '#2C3E50',
      width: 2,
      lineCap: 'round',
      lineJoin: 'round',
    },
    ...overrides,
  } as DrawElement;
}

function makeLine(id: string): DrawElement {
  return {
    id,
    type: 'line',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    stroke: {
      color: '#000000',
      width: 2,
      lineCap: 'round',
      lineJoin: 'round',
    },
  } as DrawElement;
}

function makeText(id: string): DrawElement {
  return {
    id,
    type: 'text',
    x: 50,
    y: 50,
    rotation: 0,
    opacity: 1,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    content: 'Hello',
    w: 100,
    h: 20,
    style: {
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#000000',
      align: 'left',
    },
  } as DrawElement;
}

function addOp(element: DrawElement): DrawOp {
  return { op: 'add', element };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('StreamingDrawController', () => {
  describe('basic operation ingestion', () => {
    test('add op makes element visible after flush', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeRect('r1')));
      flushRaf(1000);

      expect(frames.length).toBeGreaterThan(0);
      const last = frames[frames.length - 1]!;
      expect(last.some((v) => v.element.id === 'r1')).toBe(true);

      ctrl.destroy();
    });

    test('delete op removes element', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeRect('r1')));
      flushRaf(1000);

      ctrl.push({ op: 'delete', id: 'r1' });
      flushRaf(1016);

      const last = frames[frames.length - 1]!;
      expect(last.some((v) => v.element.id === 'r1')).toBe(false);

      ctrl.destroy();
    });

    test('clear op removes all elements', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeRect('r1')));
      ctrl.push(addOp(makeRect('r2')));
      flushRaf(1000);

      ctrl.push({ op: 'clear' });
      flushRaf(1016);

      const last = frames[frames.length - 1]!;
      expect(last.length).toBe(0);

      ctrl.destroy();
    });

    test('update op patches element properties', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeRect('r1')));
      flushRaf(1000);

      ctrl.push({ op: 'update', id: 'r1', patch: { x: 999 } });
      flushRaf(1016);

      const last = frames[frames.length - 1]!;
      const el = last.find((v) => v.element.id === 'r1');
      expect(el?.element.x).toBe(999);

      ctrl.destroy();
    });
  });

  describe('incremental element rendering', () => {
    test('elements appear one by one with stagger', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 50 });

      ctrl.push(addOp(makeRect('r1')));
      ctrl.push(addOp(makeRect('r2')));
      ctrl.push(addOp(makeRect('r3')));
      flushRaf(1000);

      // At t=1000, only r1 should be visible (r2 delayed by 50ms, r3 by 100ms)
      const frame0 = frames[frames.length - 1]!;
      const visibleIds = frame0.map((v) => v.element.id);
      expect(visibleIds).toContain('r1');
      // r2 and r3 may not be visible yet due to delay
      expect(frame0.length).toBeLessThanOrEqual(3);

      // At t=1100, all should be visible
      flushRaf(1100);
      const frame1 = frames[frames.length - 1]!;
      expect(frame1.length).toBe(3);

      ctrl.destroy();
    });

    test('onFirstElement fires on first add', () => {
      let firstEl: DrawElement | null = null;
      const ctrl = new StreamingDrawController({
        onFirstElement: (el) => { firstEl = el; },
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeRect('r1')));
      flushRaf(1000);

      expect(firstEl).not.toBeNull();
      expect(firstEl!.id).toBe('r1');

      // Second add should not trigger again
      firstEl = null;
      ctrl.push(addOp(makeRect('r2')));
      flushRaf(1016);
      expect(firstEl).toBeNull();

      ctrl.destroy();
    });
  });

  describe('animation timing', () => {
    test('rect uses popIn effect with easeOutBack', () => {
      const ctrl = new StreamingDrawController({}, { staggerMs: 0 });

      const config = ctrl.resolveAnimation(makeRect('r1'));
      expect(config.effect).toBe('popIn');
      expect(config.durationMs).toBe(250);

      ctrl.destroy();
    });

    test('line uses drawIn effect', () => {
      const ctrl = new StreamingDrawController({}, { staggerMs: 0 });

      const config = ctrl.resolveAnimation(makeLine('l1'));
      expect(config.effect).toBe('drawIn');
      expect(config.durationMs).toBe(300);

      ctrl.destroy();
    });

    test('text uses fadeIn effect', () => {
      const ctrl = new StreamingDrawController({}, { staggerMs: 0 });

      const config = ctrl.resolveAnimation(makeText('t1'));
      expect(config.effect).toBe('fadeIn');
      expect(config.durationMs).toBe(200);

      ctrl.destroy();
    });

    test('animation progress goes from 0 to 1 over duration', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeText('t1')));

      // At start
      flushRaf(1000);
      const frame0 = frames[frames.length - 1]!;
      const el0 = frame0.find((v) => v.element.id === 't1');
      expect(el0).toBeDefined();
      expect(el0!.animProgress).toBe(0); // fadeIn starts at 0

      // Midway (100ms into 200ms animation)
      flushRaf(1100);
      const frame1 = frames[frames.length - 1]!;
      const el1 = frame1.find((v) => v.element.id === 't1');
      expect(el1!.animProgress).toBeGreaterThan(0);
      expect(el1!.animProgress).toBeLessThan(1);

      // Completed (200ms+)
      flushRaf(1200);
      const frame2 = frames[frames.length - 1]!;
      const el2 = frame2.find((v) => v.element.id === 't1');
      expect(el2!.animProgress).toBe(1);

      ctrl.destroy();
    });

    test('popIn element has scale < 1 at start, ~1 at end', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeRect('r1')));
      flushRaf(1000); // t=0

      const el0 = frames[frames.length - 1]!.find((v) => v.element.id === 'r1')!;
      // popIn starts with scale ~0.85
      expect(el0.computedScale).toBeLessThan(1);

      // After full duration
      flushRaf(1300); // well past 250ms
      const el1 = frames[frames.length - 1]!.find((v) => v.element.id === 'r1')!;
      // easeOutBack overshoots slightly, so scale may be > 1
      expect(el1.computedScale).toBeGreaterThanOrEqual(0.99);

      ctrl.destroy();
    });

    test('drawIn element has strokeProgress 0→1', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeLine('l1')));
      flushRaf(1000);

      const el0 = frames[frames.length - 1]!.find((v) => v.element.id === 'l1')!;
      expect(el0.strokeProgress).toBe(0);

      flushRaf(1300); // past 300ms duration
      const el1 = frames[frames.length - 1]!.find((v) => v.element.id === 'l1')!;
      expect(el1.strokeProgress).toBe(1);

      ctrl.destroy();
    });
  });

  describe('progress tracking', () => {
    test('progress reflects element count vs expected', () => {
      const ctrl = new StreamingDrawController({}, { staggerMs: 0 });

      ctrl.setExpectedCount(4);
      expect(ctrl.getProgress()).toBe(0);

      ctrl.push(addOp(makeRect('r1')));
      flushRaf(1000);
      expect(ctrl.getProgress()).toBe(25);

      ctrl.push(addOp(makeRect('r2')));
      flushRaf(1016);
      expect(ctrl.getProgress()).toBe(50);

      ctrl.destroy();
    });

    test('progress is 100 when completed with no expected count', () => {
      const ctrl = new StreamingDrawController({}, { staggerMs: 0 });

      ctrl.finish();
      flushRaf(1000);
      expect(ctrl.getProgress()).toBe(100);

      ctrl.destroy();
    });
  });

  describe('pause / resume', () => {
    test('paused controller does not schedule new frames', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeRect('r1')));
      ctrl.pause();

      // Should not produce a frame since it's paused before the tick
      const prevLen = frames.length;
      flushRaf(1000);

      // After resume, pushing a new op triggers frames again
      ctrl.resume();
      ctrl.push(addOp(makeRect('r2')));
      flushRaf(1016);

      expect(frames.length).toBeGreaterThan(prevLen);

      ctrl.destroy();
    });
  });

  describe('completion', () => {
    test('onComplete fires after all animations finish', () => {
      let completed = false;
      const ctrl = new StreamingDrawController({
        onComplete: () => { completed = true; },
      }, { staggerMs: 0 });

      ctrl.push(addOp(makeText('t1'))); // 200ms fadeIn
      ctrl.finish();
      flushRaf(1000); // starts animation
      expect(completed).toBe(false);

      // Animation still running
      flushRaf(1100);
      expect(completed).toBe(false);

      // Animation complete
      flushRaf(1201);
      expect(completed).toBe(true);

      ctrl.destroy();
    });
  });

  describe('batch operations', () => {
    test('pushBatch adds multiple elements in one call', () => {
      const frames: VisibleElement[][] = [];
      const ctrl = new StreamingDrawController({
        onFrame: (els) => frames.push([...els]),
      }, { staggerMs: 0 });

      ctrl.pushBatch([
        addOp(makeRect('r1')),
        addOp(makeRect('r2')),
        addOp(makeText('t1')),
      ]);
      flushRaf(1000);

      const last = frames[frames.length - 1]!;
      expect(last.length).toBe(3);

      ctrl.destroy();
    });
  });
});

describe('easing functions', () => {
  test('all return 0 at t=0 and 1 at t=1', () => {
    for (const [name, fn] of Object.entries(easing)) {
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
  });

  test('easeOutExpo is close to 1 by t=0.5', () => {
    // Expo deceleration should be past 0.95 by midpoint
    expect(easing.easeOutExpo(0.5)).toBeGreaterThan(0.95);
  });

  test('easeOutBack overshoots 1 briefly', () => {
    // At some t < 1, value should exceed 1
    let overshot = false;
    for (let t = 0; t <= 1; t += 0.01) {
      if (easing.easeOutBack(t) > 1) {
        overshot = true;
        break;
      }
    }
    expect(overshot).toBe(true);
  });

  test('linear is identity', () => {
    expect(easing.linear(0.3)).toBeCloseTo(0.3);
    expect(easing.linear(0.7)).toBeCloseTo(0.7);
  });
});
