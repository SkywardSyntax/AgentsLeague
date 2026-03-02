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

  it('handles oversized elements without contradictory corrections', () => {
    const batch: DrawBatch = {
      batch_id: 'b3',
      elements: [{ id: 'r1', type: 'rect', x: -10, y: 30, w: 900, h: 50 }],
    };

    const repaired = enforceDrawBatchConstraints(batch, {
      canvasWidth: 800,
      canvasHeight: 600,
      margin: 20,
    });

    const rect = repaired.batch.elements[0]!;
    expect(rect.type).toBe('rect');
    if (rect.type !== 'rect') return;

    // Oversized element should be clamped to left margin, not pushed both ways
    expect(rect.x).toBe(20);
  });

  it('fallback reflow preserves two-column structure', () => {
    // Two columns of text that overlap within each column
    const batch: DrawBatch = {
      batch_id: 'b4',
      elements: [
        { id: 'left-1', type: 'text', x: 50, y: 100, text: 'left column line one', size: 18 },
        { id: 'left-2', type: 'text', x: 55, y: 101, text: 'left column line two', size: 18 },
        { id: 'right-1', type: 'text', x: 600, y: 100, text: 'right column line one', size: 18 },
        { id: 'right-2', type: 'text', x: 605, y: 101, text: 'right column line two', size: 18 },
      ],
    };

    const repaired = enforceDrawBatchConstraints(batch, {
      canvasWidth: 1600,
      canvasHeight: 1200,
      margin: 24,
      maxRepairIterations: 0, // force fallback
    });

    // After fallback reflow, left-column elements should still be
    // spatially separated from right-column elements
    const leftEls = repaired.batch.elements.filter(
      (el) => el.type === 'text' && el.id.startsWith('left'),
    );
    const rightEls = repaired.batch.elements.filter(
      (el) => el.type === 'text' && el.id.startsWith('right'),
    );
    expect(leftEls.length).toBe(2);
    expect(rightEls.length).toBe(2);

    // Right-column x positions should remain distinct from left-column
    for (const r of rightEls) {
      if (r.type === 'text') {
        for (const l of leftEls) {
          if (l.type === 'text') {
            expect(r.x).toBeGreaterThan(l.x + 100);
          }
        }
      }
    }
  });
});
