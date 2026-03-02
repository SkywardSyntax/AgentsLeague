import { describe, expect, it } from 'vitest';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner';
import type { DrawBatch } from '@/types/agent';

describe('enforceDrawBatchConstraints boundary values', () => {
  it('element exactly at margin boundary (x=24) is not shifted', () => {
    const batch: DrawBatch = {
      batch_id: 'boundary-1',
      elements: [{ id: 'r1', type: 'rect', x: 24, y: 24, w: 50, h: 50 }],
    };
    const result = enforceDrawBatchConstraints(batch);
    const rect = result.batch.elements[0]!;
    expect(rect.type).toBe('rect');
    if (rect.type !== 'rect') return;
    expect(rect.x).toBe(24);
    expect(rect.y).toBe(24);
    expect(result.violationsFixed).toHaveLength(0);
  });

  it('text elements exactly minTextGap (14px) apart are not shifted', () => {
    // Text bounds with size=20: minY = y - 20*0.9 = y - 18, maxY = y + 20*0.5 = y + 10
    // First text at y=100: maxY = 110
    // For gap of exactly 14: minY2 = 110 + 14 = 124 → y2 = 124 + 18 = 142
    // needed = 110 + 14 - 124 = 0, so no shift
    const batch: DrawBatch = {
      batch_id: 'boundary-2',
      elements: [
        { id: 't1', type: 'text', x: 100, y: 100, text: 'first line', size: 20 },
        { id: 't2', type: 'text', x: 100, y: 142, text: 'second line', size: 20 },
      ],
    };
    const result = enforceDrawBatchConstraints(batch);
    const t2 = result.batch.elements[1]!;
    expect(t2.type).toBe('text');
    if (t2.type !== 'text') return;
    expect(t2.y).toBe(142);
    expect(result.violationsFixed).not.toContain('shift_y');
  });

  it('arrow exactly 22px long is not extended', () => {
    const batch: DrawBatch = {
      batch_id: 'boundary-3',
      elements: [{ id: 'a1', type: 'arrow', from: { x: 100, y: 100 }, to: { x: 122, y: 100 } }],
    };
    const result = enforceDrawBatchConstraints(batch);
    expect(result.violationsFixed).not.toContain('arrow_endpoint_adjust');
    const arrow = result.batch.elements[0]!;
    if (arrow.type === 'arrow') {
      expect(arrow.to.x).toBe(122);
    }
  });

  it('arrow at 21.99px triggers extension to 28px', () => {
    const batch: DrawBatch = {
      batch_id: 'boundary-4',
      elements: [{ id: 'a1', type: 'arrow', from: { x: 100, y: 100 }, to: { x: 121.99, y: 100 } }],
    };
    const result = enforceDrawBatchConstraints(batch);
    expect(result.violationsFixed).toContain('arrow_endpoint_adjust');
    const arrow = result.batch.elements[0]!;
    if (arrow.type === 'arrow') {
      expect(arrow.to.x).toBeCloseTo(128, 1);
    }
  });

  it('fallback triggered when repair needs > 3 iterations', () => {
    // Place 5 text elements near the bottom of the canvas so text spacing pushes
    // them below canvas bounds, and ensureCanvasBounds pushes them back up,
    // creating new overlaps each iteration — cycling until maxRepairIterations is exceeded.
    const batch: DrawBatch = {
      batch_id: 'boundary-5',
      elements: [
        { id: 't1', type: 'text', x: 100, y: 1150, text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        { id: 't2', type: 'text', x: 100, y: 1151, text: 'bbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        { id: 't3', type: 'text', x: 100, y: 1152, text: 'ccccccccccccccccccccccccccc' },
        { id: 't4', type: 'text', x: 100, y: 1153, text: 'ddddddddddddddddddddddddd' },
        { id: 't5', type: 'text', x: 100, y: 1154, text: 'eeeeeeeeeeeeeeeeeeeeeeeeeee' },
      ],
    };
    const result = enforceDrawBatchConstraints(batch);
    expect(result.fallbackUsed).toBe(true);
    expect(result.violationsFixed).toContain('region_reflow');
  });
});
