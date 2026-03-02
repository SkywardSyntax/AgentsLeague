import { describe, expect, it } from 'vitest';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner';
import type { DrawBatch } from '@/types/agent';

describe('planner constraints', () => {
  it('repairs overlapping text blocks', () => {
    const batch: DrawBatch = {
      batch_id: 'b1',
      elements: [
        { id: 't1', type: 'text', x: 40, y: 100, text: 'line one', size: 22 },
        { id: 't2', type: 'text', x: 45, y: 102, text: 'line two', size: 22 },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch);
    const t1 = repaired.batch.elements[0]!;
    const t2 = repaired.batch.elements[1]!;

    expect(t1.type).toBe('text');
    expect(t2.type).toBe('text');
    if (t1.type !== 'text' || t2.type !== 'text') return;

    expect(t2.y).toBeGreaterThan(t1.y + 8);
    expect(repaired.violationsFixed.length).toBeGreaterThan(0);
  });

  it('clamps elements back into canvas bounds', () => {
    const batch: DrawBatch = {
      batch_id: 'b2',
      elements: [{ id: 'r1', type: 'rect', x: -120, y: -80, w: 150, h: 100 }],
    };

    const repaired = enforceDrawBatchConstraints(batch, {
      canvasWidth: 800,
      canvasHeight: 600,
      margin: 20,
    });

    const rect = repaired.batch.elements[0]!;
    expect(rect.type).toBe('rect');
    if (rect.type !== 'rect') return;

    expect(rect.x).toBeGreaterThanOrEqual(20);
    expect(rect.y).toBeGreaterThanOrEqual(20);
  });
});
