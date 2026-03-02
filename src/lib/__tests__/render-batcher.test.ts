import { describe, expect, it } from 'vitest';
import { createRenderBatcher } from '@/lib/whiteboard/render-batcher';
import type { ActiveStroke } from '@/types/agent';

function makeStroke(overrides: Partial<ActiveStroke> = {}): ActiveStroke {
  return {
    id: overrides.id ?? 's1',
    elementId: overrides.elementId ?? 'e1',
    points: overrides.points ?? [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    color: overrides.color ?? '#1f2a44',
    baseWidth: overrides.baseWidth ?? 1.45,
    startedAt: overrides.startedAt ?? 1000,
    durationMs: overrides.durationMs ?? 500,
    length: overrides.length ?? 14.14,
    cumulativeLengths: overrides.cumulativeLengths ?? [0, 14.14],
  };
}

describe('render-batcher', () => {
  it('createRenderBatcher returns object with enqueue, flush, pending methods', () => {
    const batcher = createRenderBatcher();
    expect(typeof batcher.enqueue).toBe('function');
    expect(typeof batcher.flush).toBe('function');
    expect(typeof batcher.pending).toBe('function');
  });

  it('enqueueing a single stroke and flushing returns that stroke', () => {
    const batcher = createRenderBatcher();
    const stroke = makeStroke({ id: 'single' });
    batcher.enqueue(stroke);
    const flushed = batcher.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0]!.id).toBe('single');
  });

  it('enqueueing 5 strokes before flush returns all 5 in a single batch', () => {
    const batcher = createRenderBatcher();
    for (let i = 0; i < 5; i++) {
      batcher.enqueue(makeStroke({ id: `s${i}` }));
    }
    const flushed = batcher.flush();
    expect(flushed).toHaveLength(5);
  });

  it('pending() returns 0 after flush', () => {
    const batcher = createRenderBatcher();
    batcher.enqueue(makeStroke());
    batcher.flush();
    expect(batcher.pending()).toBe(0);
  });

  it('pending() returns correct count before flush', () => {
    const batcher = createRenderBatcher();
    batcher.enqueue(makeStroke());
    batcher.enqueue(makeStroke());
    batcher.enqueue(makeStroke());
    expect(batcher.pending()).toBe(3);
  });

  it('flush on empty queue returns empty array', () => {
    const batcher = createRenderBatcher();
    const flushed = batcher.flush();
    expect(flushed).toEqual([]);
  });

  it('double flush returns empty on second call', () => {
    const batcher = createRenderBatcher();
    batcher.enqueue(makeStroke());
    batcher.flush();
    const second = batcher.flush();
    expect(second).toEqual([]);
  });

  it('enqueue after flush starts a new batch', () => {
    const batcher = createRenderBatcher();
    batcher.enqueue(makeStroke({ id: 'first' }));
    batcher.flush();
    batcher.enqueue(makeStroke({ id: 'second' }));
    const flushed = batcher.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0]!.id).toBe('second');
  });

  it('preserves stroke elementId through round-trip', () => {
    const batcher = createRenderBatcher();
    batcher.enqueue(makeStroke({ elementId: 'elem-42' }));
    const flushed = batcher.flush();
    expect(flushed[0]!.elementId).toBe('elem-42');
  });

  it('preserves startedAt and durationMs fields', () => {
    const batcher = createRenderBatcher();
    batcher.enqueue(makeStroke({ startedAt: 9999, durationMs: 750 }));
    const flushed = batcher.flush();
    expect(flushed[0]!.startedAt).toBe(9999);
    expect(flushed[0]!.durationMs).toBe(750);
  });
});
