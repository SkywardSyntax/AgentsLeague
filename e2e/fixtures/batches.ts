/**
 * Deterministic DrawBatch fixtures for passthrough E2E tests.
 * All IDs and coordinates are fixed for reproducible assertions.
 */

import type { DrawBatch } from '@/types/agent';

export const FIXTURE_SIMPLE_RECT_BATCH: DrawBatch = {
  batch_id: 'fixture-rect-001',
  style_preset: 'clean_pen_sketch',
  elements: [
    { id: 'fix-r1', type: 'rect', x: 100, y: 100, w: 200, h: 120 },
    { id: 'fix-t1', type: 'text', x: 140, y: 150, text: 'Test Label', size: 16 },
  ],
};

export const FIXTURE_MULTI_ELEMENT_BATCH: DrawBatch = {
  batch_id: 'fixture-multi-001',
  elements: [
    { id: 'fix-r2', type: 'rect', x: 50, y: 50, w: 150, h: 100 },
    { id: 'fix-e1', type: 'ellipse', cx: 300, cy: 150, rx: 60, ry: 40 },
    { id: 'fix-l1', type: 'line', from: { x: 50, y: 200 }, to: { x: 300, y: 200 } },
    { id: 'fix-a1', type: 'arrow', from: { x: 200, y: 50 }, to: { x: 350, y: 100 } },
    { id: 'fix-t2', type: 'text', x: 100, y: 240, text: 'Caption', size: 14 },
  ],
};

export const FIXTURE_CLEAR_BATCH: DrawBatch = {
  batch_id: 'fixture-clear-001',
  elements: [{ id: 'fix-c1', type: 'clear' }],
};
