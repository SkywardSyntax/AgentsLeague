import { describe, expect, it } from 'vitest';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner';
import type { DrawBatch, DrawElement } from '@/types/agent';

describe('planner constraints performance', () => {
  it('resolves 80-element batch within 50ms', () => {
    const elements: DrawElement[] = [];
    let y = 50;
    for (let i = 0; i < 80; i++) {
      const isLatex = i % 3 === 0;
      if (isLatex) {
        elements.push({
          id: `el-${i}`,
          type: 'latex',
          x: 100 + (i % 4) * 50,
          y,
          tex: `x^{${i}}+${i}`,
          displayMode: i % 2 === 0,
        });
      } else {
        elements.push({
          id: `el-${i}`,
          type: 'text',
          x: 100 + (i % 4) * 50,
          y,
          text: `Label number ${i} for testing`,
        });
      }
      y += 8; // tight spacing forces overlap resolution
    }

    const batch: DrawBatch = {
      batch_id: 'perf-1',
      style_preset: 'clean_pen_sketch',
      elements,
    };
    const start = performance.now();
    const result = enforceDrawBatchConstraints(batch);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result.batch.elements).toHaveLength(80);
  });
});
