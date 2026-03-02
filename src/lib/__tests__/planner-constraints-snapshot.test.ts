import { describe, expect, it } from 'vitest';
import { enforceDrawBatchConstraints } from '@/lib/whiteboard/planner';
import type { DrawBatch } from '@/types/agent';

describe('enforceDrawBatchConstraints snapshot', () => {
  it('resolves overlapping text/latex elements and short arrow', () => {
    const batch: DrawBatch = {
      batch_id: 'snap-1',
      style_preset: 'clean_pen_sketch',
      elements: [
        { id: 't1', type: 'text', x: 100, y: 100, text: 'First equation label' },
        { id: 't2', type: 'text', x: 100, y: 105, text: 'Second overlapping label' },
        { id: 'l1', type: 'latex', x: 100, y: 110, tex: '\\frac{a}{b}', displayMode: true },
        { id: 't3', type: 'text', x: 100, y: 115, text: 'Third stacked label' },
        { id: 'l2', type: 'latex', x: 100, y: 120, tex: 'x^2+1', displayMode: false },
        { id: 'a1', type: 'arrow', from: { x: 200, y: 200 }, to: { x: 205, y: 200 } },
      ],
    };

    const result = enforceDrawBatchConstraints(batch);

    expect(result.batch.elements).toMatchInlineSnapshot(`
      [
        {
          "id": "t1",
          "text": "First equation label",
          "type": "text",
          "x": 100,
          "y": 100,
        },
        {
          "id": "t2",
          "text": "Second overlapping label",
          "type": "text",
          "x": 100,
          "y": 139.2,
        },
        {
          "displayMode": true,
          "id": "l1",
          "tex": "\\frac{a}{b}",
          "type": "latex",
          "x": 100,
          "y": 182.6,
        },
        {
          "id": "t3",
          "text": "Third stacked label",
          "type": "text",
          "x": 100,
          "y": 273.25,
        },
        {
          "displayMode": false,
          "id": "l2",
          "tex": "x^2+1",
          "type": "latex",
          "x": 100,
          "y": 316.65,
        },
        {
          "from": {
            "x": 200,
            "y": 200,
          },
          "id": "a1",
          "to": {
            "x": 228,
            "y": 200,
          },
          "type": "arrow",
        },
      ]
    `);

    expect(result.violationsFixed).toMatchInlineSnapshot(`
      [
        "arrow_endpoint_adjust",
        "shift_y",
      ]
    `);
    expect(result.fallbackUsed).toMatchInlineSnapshot(`false`);
  });
});
