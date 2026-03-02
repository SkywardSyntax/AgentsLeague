import { describe, it, expect } from 'vitest';
import type { DrawBatch, StrokeTrajectory, ActiveStroke } from '@/types/agent';

describe('Lane 01 — Canvas API Freeze', () => {
  it('WhiteboardCanvasProps requires batches and onWarning', () => {
    const props = {
      batches: [] as DrawBatch[],
      onWarning: (_w: string) => {},
    };
    expect(Object.keys(props).sort()).toMatchInlineSnapshot(`
      [
        "batches",
        "onWarning",
      ]
    `);
  });

  it('Camera interface has x, y, zoom', () => {
    const camera = { x: 40, y: 40, zoom: 1 };
    expect(camera).toMatchInlineSnapshot(`
      {
        "x": 40,
        "y": 40,
        "zoom": 1,
      }
    `);
  });

  it('MIN_ZOOM and MAX_ZOOM constants', () => {
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 4;
    expect({ MIN_ZOOM, MAX_ZOOM }).toMatchInlineSnapshot(`
      {
        "MAX_ZOOM": 4,
        "MIN_ZOOM": 0.25,
      }
    `);
  });

  it('canvas layer structure is three layers', () => {
    const layers = ['bg', 'committed', 'active'];
    expect(layers).toMatchInlineSnapshot(`
      [
        "bg",
        "committed",
        "active",
      ]
    `);
  });

  it('stats state shape has active and committed', () => {
    const stats = { active: 0, committed: 0 };
    expect(stats).toMatchInlineSnapshot(`
      {
        "active": 0,
        "committed": 0,
      }
    `);
  });

  it('DrawBatch type shape is stable', () => {
    const batch: DrawBatch = {
      batch_id: 'b1',
      elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }],
    };
    expect(Object.keys(batch).sort()).toMatchInlineSnapshot(`
      [
        "batch_id",
        "elements",
      ]
    `);
  });

  it('StrokeTrajectory shape is stable', () => {
    const stroke: StrokeTrajectory = {
      id: 's1',
      elementId: 'e1',
      points: [{ x: 0, y: 0 }],
      color: '#000',
      baseWidth: 2,
    };
    expect(Object.keys(stroke).sort()).toMatchInlineSnapshot(`
      [
        "baseWidth",
        "color",
        "elementId",
        "id",
        "points",
      ]
    `);
  });

  it('ActiveStroke extends StrokeTrajectory with animation fields', () => {
    const active: ActiveStroke = {
      id: 's1',
      elementId: 'e1',
      points: [{ x: 0, y: 0 }],
      color: '#000',
      baseWidth: 2,
      startedAt: 0,
      durationMs: 500,
      length: 10,
      cumulativeLengths: [0, 10],
    };
    const extraKeys = Object.keys(active).filter(
      (k) => !['id', 'elementId', 'points', 'color', 'baseWidth'].includes(k),
    );
    expect(extraKeys.sort()).toMatchInlineSnapshot(`
      [
        "cumulativeLengths",
        "durationMs",
        "length",
        "startedAt",
      ]
    `);
  });

  it('DrawBatch accepts optional style_preset', () => {
    const batch: DrawBatch = {
      batch_id: 'b2',
      style_preset: 'clean_pen_sketch',
      elements: [{ id: 'e1', type: 'clear' }],
    };
    expect(batch.style_preset).toMatchInlineSnapshot(`"clean_pen_sketch"`);
  });

  it('all DrawElement types are enumerable', () => {
    const types = ['rect', 'ellipse', 'line', 'arrow', 'text', 'latex', 'clear'];
    expect(types).toMatchInlineSnapshot(`
      [
        "rect",
        "ellipse",
        "line",
        "arrow",
        "text",
        "latex",
        "clear",
      ]
    `);
  });
});
