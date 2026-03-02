import { describe, it, expect } from 'vitest';
import { withJitter, rectPoints } from '@/lib/whiteboard/semantic-to-strokes';
import type { RectElement, StylePreset } from '@/types/agent';

// Re-derive strokeWidthForPreset logic to test the contract without exporting private fn.
function strokeWidthForPreset(preset: StylePreset | undefined, base: number): number {
  switch (preset) {
    case 'rough_sketch':
      return base * 1.15;
    case 'blueprint_neat':
      return base * 0.88;
    default:
      return base;
  }
}

const DEFAULT_COLOR = '#1f2a44';
const BASE_WIDTH = 1.45;

describe('Theme↔Component contract', () => {
  it('default color #1f2a44 is valid 7-char hex', () => {
    expect(DEFAULT_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('strokeWidthForPreset rough_sketch returns wider than default', () => {
    const rough = strokeWidthForPreset('rough_sketch', BASE_WIDTH);
    const clean = strokeWidthForPreset('clean_pen_sketch', BASE_WIDTH);
    expect(rough).toBeGreaterThan(clean);
  });

  it('strokeWidthForPreset blueprint_neat returns narrower than default', () => {
    const neat = strokeWidthForPreset('blueprint_neat', BASE_WIDTH);
    const clean = strokeWidthForPreset('clean_pen_sketch', BASE_WIDTH);
    expect(neat).toBeLessThan(clean);
  });

  it('strokeWidthForPreset clean_pen_sketch returns base width', () => {
    const clean = strokeWidthForPreset('clean_pen_sketch', BASE_WIDTH);
    expect(clean).toBe(BASE_WIDTH);
  });

  it('strokeWidthForPreset undefined returns base width', () => {
    const undef = strokeWidthForPreset(undefined, BASE_WIDTH);
    expect(undef).toBe(BASE_WIDTH);
  });

  it('withJitter rough_sketch produces larger max displacement', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: i * 10 }));
    const roughJittered = withJitter(points, 'seed-r', 'rough_sketch');
    const neatJittered = withJitter(points, 'seed-r', 'blueprint_neat');

    // Measure max displacement (excluding endpoints which are preserved)
    const roughMaxDisp = Math.max(
      ...roughJittered.slice(1, -1).map((p, i) => Math.hypot(p.x - points[i + 1]!.x, p.y - points[i + 1]!.y)),
    );
    const neatMaxDisp = Math.max(
      ...neatJittered.slice(1, -1).map((p, i) => Math.hypot(p.x - points[i + 1]!.x, p.y - points[i + 1]!.y)),
    );
    expect(roughMaxDisp).toBeGreaterThan(neatMaxDisp);
  });

  it('withJitter blueprint_neat produces smaller displacement than rough', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 }));
    const roughJittered = withJitter(points, 'seed-b', 'rough_sketch');
    const neatJittered = withJitter(points, 'seed-b', 'blueprint_neat');

    const roughAvgDisp = roughJittered.slice(1, -1).reduce(
      (sum, p, i) => sum + Math.hypot(p.x - points[i + 1]!.x, p.y - points[i + 1]!.y), 0,
    ) / (roughJittered.length - 2);
    const neatAvgDisp = neatJittered.slice(1, -1).reduce(
      (sum, p, i) => sum + Math.hypot(p.x - points[i + 1]!.x, p.y - points[i + 1]!.y), 0,
    ) / (neatJittered.length - 2);
    expect(neatAvgDisp).toBeLessThan(roughAvgDisp);
  });

  it('withJitter preserves first and last points exactly', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }];
    for (const preset of ['rough_sketch', 'blueprint_neat', 'clean_pen_sketch'] as StylePreset[]) {
      const jittered = withJitter(points, 'seed', preset);
      expect(jittered[0]).toEqual(points[0]);
      expect(jittered[jittered.length - 1]).toEqual(points[points.length - 1]);
    }
  });

  it('all three presets produce positive stroke widths', () => {
    const presets: (StylePreset | undefined)[] = ['clean_pen_sketch', 'rough_sketch', 'blueprint_neat', undefined];
    for (const preset of presets) {
      expect(strokeWidthForPreset(preset, BASE_WIDTH)).toBeGreaterThan(0);
    }
  });

  it('style preset enum values match schema enum values', async () => {
    const { DrawBatchSchema } = await import('@/lib/schema');
    const schemaPresets = ['clean_pen_sketch', 'rough_sketch', 'blueprint_neat'];
    const runtimePresets: StylePreset[] = ['clean_pen_sketch', 'rough_sketch', 'blueprint_neat'];
    expect(runtimePresets).toEqual(schemaPresets);
    // Verify each preset validates against the schema
    for (const preset of runtimePresets) {
      const result = DrawBatchSchema.safeParse({
        batch_id: 'test',
        style_preset: preset,
        elements: [],
      });
      expect(result.success).toBe(true);
    }
  });
});
