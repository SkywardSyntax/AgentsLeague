import { describe, it, expect } from 'vitest';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { createActiveBatch, easeOutCubic } from '@/lib/whiteboard/stroke-scheduler';
import { screenStrokePx, cumulativeLengths, MIN_SCREEN_STROKE_PX, MAX_SCREEN_STROKE_PX } from '@/lib/whiteboard/geometry';
import type { DrawBatch, ArrowElement, RectElement } from '@/types/agent';

let _ctr = 0;
function buildDrawBatch(overrides?: Partial<DrawBatch>): DrawBatch {
  return {
    batch_id: `batch-${++_ctr}`,
    elements: [{ id: `el-${_ctr}`, type: 'rect', x: 0, y: 0, w: 100, h: 50 } as RectElement],
    ...overrides,
  };
}

describe('Canvas↔State contract', () => {
  it('new rect batch produces strokes with correct elementId linkage', async () => {
    const rect: RectElement = { id: 'r1', type: 'rect', x: 10, y: 20, w: 100, h: 50 };
    const batch = buildDrawBatch({ elements: [rect] });
    const { strokes } = await compileBatchToStrokes(batch);
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes.every((s) => s.elementId === 'r1')).toBe(true);
  });

  it('batch with clear element sets clear flag to true', async () => {
    const batch = buildDrawBatch({ elements: [{ id: 'c1', type: 'clear' }] });
    const { clear } = await compileBatchToStrokes(batch);
    expect(clear).toBe(true);
  });

  it('empty elements array produces zero strokes', async () => {
    const batch = buildDrawBatch({ elements: [] });
    const { strokes } = await compileBatchToStrokes(batch);
    expect(strokes).toHaveLength(0);
  });

  it('screenStrokePx clamps to MIN/MAX bounds', () => {
    const tooSmall = screenStrokePx(0.001, 0.1, 1);
    expect(tooSmall).toBeCloseTo(MIN_SCREEN_STROKE_PX);
    const tooLarge = screenStrokePx(100, 10, 4);
    expect(tooLarge).toBeCloseTo(MAX_SCREEN_STROKE_PX);
  });

  it('createActiveBatch sets duration within 220–2600ms range', () => {
    const strokes = [
      { id: 's1', elementId: 'e1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#000', baseWidth: 2 },
      { id: 's2', elementId: 'e2', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color: '#000', baseWidth: 2 },
    ];
    const active = createActiveBatch(strokes);
    for (const s of active) {
      expect(s.durationMs).toBeGreaterThanOrEqual(220);
      expect(s.durationMs).toBeLessThanOrEqual(2600);
    }
  });

  it('createActiveBatch computes cumulativeLengths matching geometry', () => {
    const points = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 }];
    const strokes = [{ id: 's1', elementId: 'e1', points, color: '#000', baseWidth: 2 }];
    const active = createActiveBatch(strokes);
    const expected = cumulativeLengths(points);
    expect(active[0]!.cumulativeLengths).toEqual(expected);
  });

  it('easeOutCubic boundary values are 0 and 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('multiple batches produce independent stroke sets with no id collision', async () => {
    const batch1 = buildDrawBatch({
      batch_id: 'b1',
      elements: [{ id: 'el-a', type: 'rect', x: 0, y: 0, w: 50, h: 50 } as RectElement],
    });
    const batch2 = buildDrawBatch({
      batch_id: 'b2',
      elements: [{ id: 'el-b', type: 'rect', x: 100, y: 100, w: 50, h: 50 } as RectElement],
    });
    const { strokes: s1 } = await compileBatchToStrokes(batch1);
    const { strokes: s2 } = await compileBatchToStrokes(batch2);
    const ids1 = new Set(s1.map((s) => s.id));
    const ids2 = new Set(s2.map((s) => s.id));
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false);
    }
  });

  it('arrow batch produces main + 2 head strokes (3 total)', async () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      from: { x: 0, y: 0 }, to: { x: 100, y: 50 },
    };
    const batch = buildDrawBatch({ elements: [arrow] });
    const { strokes } = await compileBatchToStrokes(batch);
    const arrowStrokes = strokes.filter((s) => s.elementId === 'a1');
    expect(arrowStrokes).toHaveLength(3);
  });

  it('all strokes from a rect batch have non-empty finite points', async () => {
    const rect: RectElement = { id: 'r2', type: 'rect', x: 50, y: 50, w: 200, h: 100 };
    const batch = buildDrawBatch({ elements: [rect] });
    const { strokes } = await compileBatchToStrokes(batch);
    for (const stroke of strokes) {
      expect(stroke.points.length).toBeGreaterThan(0);
      for (const p of stroke.points) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });
});
