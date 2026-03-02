import { describe, expect, it } from 'vitest';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner';
import type { DrawBatch } from '@/types/agent';

describe('enforceDrawBatchConstraints — simultaneous violations', () => {
  it('arrow too short + out of canvas bounds', () => {
    const batch: DrawBatch = {
      batch_id: 'combo1',
      elements: [
        { id: 'a1', type: 'arrow', from: { x: 1590, y: 10 }, to: { x: 1595, y: 10 } },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const arrow = result.batch.elements[0]!;
    expect(arrow.type).toBe('arrow');
    if (arrow.type !== 'arrow') return;

    const len = Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y);
    expect(len).toBeGreaterThanOrEqual(22);
    expect(arrow.to.x).toBeLessThanOrEqual(1600 - 24);
    expect(result.violationsFixed).toContain('arrow_endpoint_adjust');
  });

  it('two text elements vertically overlapping + one out of canvas top', () => {
    const batch: DrawBatch = {
      batch_id: 'combo2',
      elements: [
        { id: 't1', type: 'text', x: 100, y: 5, text: 'first line', size: 20 },
        { id: 't2', type: 'text', x: 100, y: 15, text: 'second line', size: 20 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const t1 = result.batch.elements[0]!;
    const t2 = result.batch.elements[1]!;
    expect(t1.type).toBe('text');
    expect(t2.type).toBe('text');
    if (t1.type !== 'text' || t2.type !== 'text') return;

    expect(t1.y).toBeGreaterThanOrEqual(24);
    expect(t2.y).toBeGreaterThan(t1.y);
  });

  it('label overlapping its parent shape', () => {
    const batch: DrawBatch = {
      batch_id: 'combo3',
      elements: [
        { id: 'box', type: 'rect', x: 100, y: 100, w: 200, h: 100 },
        { id: 'box-label', type: 'text', x: 100, y: 150, text: 'Label', size: 20 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const label = result.batch.elements[1]!;
    expect(label.type).toBe('text');
    if (label.type !== 'text') return;

    // label should be shifted below the rect (rect bottom = 200, plus minLabelGap = 10)
    expect(label.y).toBeGreaterThanOrEqual(200);
  });

  it('fallback reflow triggered by irreconcilable overlaps', () => {
    // Use a tiny canvas so ensureCanvasBounds fights with resolveTextSpacing:
    // text spacing pushes items down, canvas bounds pushes them back up → cycle
    const elements = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      type: 'text' as const,
      x: 100,
      y: 100,
      text: `Overlapping text item number ${i} with enough length to cause overlap`,
      size: 22,
    }));

    const batch: DrawBatch = { batch_id: 'combo4', elements };
    const result = enforceDrawBatchConstraints(batch, {
      canvasHeight: 200,
      margin: 20,
      maxRepairIterations: 3,
    });
    expect(result.fallbackUsed).toBe(true);
  });

  it('all elements within bounds → no violations', () => {
    const batch: DrawBatch = {
      batch_id: 'combo5',
      elements: [
        { id: 'r1', type: 'rect', x: 200, y: 200, w: 100, h: 50 },
        { id: 't1', type: 'text', x: 400, y: 400, text: 'Hello', size: 18 },
        { id: 'e1', type: 'ellipse', cx: 800, cy: 600, rx: 40, ry: 30 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    expect(result.violationsFixed).toHaveLength(0);
    expect(result.fallbackUsed).toBe(false);
  });

  it('custom PlannerConfig overrides defaults', () => {
    const batch: DrawBatch = {
      batch_id: 'combo6',
      elements: [
        { id: 'r1', type: 'rect', x: 50, y: 50, w: 80, h: 40 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch, { margin: 100 });
    const rect = result.batch.elements[0]!;
    expect(rect.type).toBe('rect');
    if (rect.type !== 'rect') return;

    expect(rect.x).toBeGreaterThanOrEqual(100);
    expect(rect.y).toBeGreaterThanOrEqual(100);
  });

  it('clear element is ignored by constraint system', () => {
    const batch: DrawBatch = {
      batch_id: 'combo7',
      elements: [
        { id: 'c1', type: 'clear' },
        { id: 'r1', type: 'rect', x: 0, y: 0, w: 50, h: 50 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const clear = result.batch.elements[0]!;
    expect(clear.type).toBe('clear');
    expect(clear.id).toBe('c1');

    const rect = result.batch.elements[1]!;
    expect(rect.type).toBe('rect');
    if (rect.type !== 'rect') return;
    expect(rect.x).toBeGreaterThanOrEqual(24);
    expect(rect.y).toBeGreaterThanOrEqual(24);
  });

  it('empty elements array produces no violations', () => {
    const result = enforceDrawBatchConstraints({ batch_id: 'combo8', elements: [] });
    expect(result.violationsFixed).toHaveLength(0);
    expect(result.fallbackUsed).toBe(false);
    expect(result.batch.elements).toHaveLength(0);
  });

  it('ellipse at canvas corner gets clamped', () => {
    const batch: DrawBatch = {
      batch_id: 'combo9',
      elements: [
        { id: 'e1', type: 'ellipse', cx: 10, cy: 10, rx: 50, ry: 50 },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const ellipse = result.batch.elements[0]!;
    expect(ellipse.type).toBe('ellipse');
    if (ellipse.type !== 'ellipse') return;

    // minX = cx - rx should be >= margin (24)
    expect(ellipse.cx - ellipse.rx).toBeGreaterThanOrEqual(24);
    expect(ellipse.cy - ellipse.ry).toBeGreaterThanOrEqual(24);
    expect(result.violationsFixed.length).toBeGreaterThan(0);
  });

  it('large latex element exceeding canvas width gets clamped', () => {
    const batch: DrawBatch = {
      batch_id: 'combo10',
      elements: [
        {
          id: 'l1',
          type: 'latex',
          x: 1500,
          y: 100,
          tex: 'x^2+y^2=z^2',
          fontSize: 24,
          displayMode: true,
        },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);
    const latex = result.batch.elements[0]!;
    expect(latex.type).toBe('latex');
    if (latex.type !== 'latex') return;

    // Should have been shifted left so it fits within canvas
    expect(latex.x).toBeLessThan(1500);
    expect(result.violationsFixed.length).toBeGreaterThan(0);
  });
});
