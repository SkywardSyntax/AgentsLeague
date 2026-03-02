import { describe, expect, it } from 'vitest';
import {
  planSemanticBatch,
  lowerPlannedLayoutToDrawBatch,
  enforceDrawBatchConstraints,
} from '@/lib/whiteboard/planner';
import type { SemanticBatch } from '@/types/agent';

describe('Planner pipeline integration (plan → lower → constrain)', () => {
  it('processes a multi-block semantic batch end-to-end', () => {
    const semanticBatch: SemanticBatch = {
      batch_id: 'integration-1',
      template: 'equation_derivation_vertical',
      intent: 'derive',
      blocks: [
        {
          id: 'eq1',
          kind: 'equation_stack',
          lines: [
            { id: 'l1', tex: 'f(x) = x^2 + 2x + 1' },
            { id: 'l2', tex: "f'(x) = 2x + 2" },
            { id: 'l3', tex: "f''(x) = 2" },
          ],
        },
        {
          id: 'cap1',
          kind: 'caption',
          text: 'Successive derivatives of a quadratic',
        },
      ],
    };

    const layout = planSemanticBatch(semanticBatch);
    const drawBatch = lowerPlannedLayoutToDrawBatch(layout);
    const { batch, violationsFixed, fallbackUsed } =
      enforceDrawBatchConstraints(drawBatch);

    // Pipeline produces elements
    expect(batch.elements.length).toBeGreaterThan(0);
    expect(batch.batch_id).toBe('integration-1');

    // Constraint result shape
    expect(Array.isArray(violationsFixed)).toBe(true);
    expect(typeof fallbackUsed).toBe('boolean');

    // All positional elements within canvas bounds
    for (const el of batch.elements) {
      if (el.type === 'text' || el.type === 'latex') {
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
