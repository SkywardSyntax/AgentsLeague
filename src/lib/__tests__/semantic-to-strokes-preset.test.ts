import { describe, expect, it } from 'vitest';
import { compileBatchToStrokes, withJitter } from '@/lib/whiteboard/semantic-to-strokes';
import type { DrawBatch, StylePreset } from '@/types/agent';

function makeRectBatch(preset: StylePreset | undefined, strokeWidth: number): DrawBatch {
  return {
    batch_id: 'b-preset',
    style_preset: preset,
    elements: [
      { id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50, stroke_width: strokeWidth },
    ],
  };
}

describe('strokeWidthForPreset exhaustive coverage', () => {
  it('returns base * 1.15 for rough_sketch', async () => {
    const result = await compileBatchToStrokes(makeRectBatch('rough_sketch', 2.0));
    expect(result.strokes[0]!.baseWidth).toBeCloseTo(2.0 * 1.15, 10);
  });

  it('returns base * 0.88 for blueprint_neat', async () => {
    const result = await compileBatchToStrokes(makeRectBatch('blueprint_neat', 2.0));
    expect(result.strokes[0]!.baseWidth).toBeCloseTo(2.0 * 0.88, 10);
  });

  it('returns unmodified base for clean_pen_sketch', async () => {
    const result = await compileBatchToStrokes(makeRectBatch('clean_pen_sketch', 2.0));
    expect(result.strokes[0]!.baseWidth).toBe(2.0);
  });

  it('returns unmodified base when preset is undefined (defaults to clean_pen_sketch)', async () => {
    const result = await compileBatchToStrokes(makeRectBatch(undefined, 2.0));
    expect(result.strokes[0]!.baseWidth).toBe(2.0);
  });

  it('withJitter applies distinct jitter amounts per preset', () => {
    const points = Array.from({ length: 7 }, (_, i) => ({ x: i * 10, y: i * 10 }));
    const seed = 'test';

    const rough = withJitter([...points.map((p) => ({ ...p }))], seed, 'rough_sketch');
    const clean = withJitter([...points.map((p) => ({ ...p }))], seed, 'clean_pen_sketch');
    const blueprint = withJitter([...points.map((p) => ({ ...p }))], seed, 'blueprint_neat');

    // Endpoints are never modified
    expect(rough[0]).toEqual(points[0]);
    expect(rough[rough.length - 1]).toEqual(points[points.length - 1]);
    expect(clean[0]).toEqual(points[0]);
    expect(clean[clean.length - 1]).toEqual(points[points.length - 1]);
    expect(blueprint[0]).toEqual(points[0]);
    expect(blueprint[blueprint.length - 1]).toEqual(points[points.length - 1]);

    // Measure max displacement for interior points
    function maxDisplacement(jittered: typeof points): number {
      let max = 0;
      for (let i = 1; i < jittered.length - 1; i++) {
        const dx = Math.abs(jittered[i]!.x - points[i]!.x);
        const dy = Math.abs(jittered[i]!.y - points[i]!.y);
        max = Math.max(max, dx, dy);
      }
      return max;
    }

    const roughMax = maxDisplacement(rough);
    const cleanMax = maxDisplacement(clean);
    const blueprintMax = maxDisplacement(blueprint);

    // rough_sketch (0.85) > clean_pen_sketch (0.24) > blueprint_neat (0.12)
    // All jitter amounts are > 0, so all should produce some displacement
    expect(roughMax).toBeGreaterThan(0);
    expect(cleanMax).toBeGreaterThan(0);
    expect(blueprintMax).toBeGreaterThan(0);

    // The jitter amounts dictate maximum possible displacement (amount * 0.5),
    // so rough should have the largest and blueprint the smallest
    expect(roughMax).toBeGreaterThan(blueprintMax);
  });
});
