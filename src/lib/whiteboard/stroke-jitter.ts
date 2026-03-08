import type { Point, StylePreset } from '@/types/agent';
import { hashString, seededRandom } from '@/lib/math/seed';

/** Per-preset rendering parameters. */
export interface StylePresetConfig {
  amount: number;
  frequency: number;
  baseWidth: number;
  widthVariance: number;
  seed: number;
}

export const STYLE_PRESETS: Record<StylePreset, StylePresetConfig> = {
  mathematical: {
    amount: 0,
    frequency: 0,
    baseWidth: 1.5,
    widthVariance: 0,
    seed: 0,
  },
  blueprint_neat: {
    amount: 0.04,
    frequency: 0.1,
    baseWidth: 1.6,
    widthVariance: 0.02,
    seed: 42,
  },
  clean_pen_sketch: {
    amount: 0.24,
    frequency: 0.5,
    baseWidth: 1.8,
    widthVariance: 0.08,
    seed: 0,
  },
  rough_sketch: {
    amount: 0.85,
    frequency: 1.0,
    baseWidth: 2.2,
    widthVariance: 0.15,
    seed: 0,
  },
};

/** Retrieve the config for a style preset (defaults to clean_pen_sketch). */
export function getPresetConfig(preset: StylePreset | undefined): StylePresetConfig {
  return STYLE_PRESETS[preset ?? 'clean_pen_sketch'];
}

export function withJitter(points: Point[], seed: string, preset: StylePreset | undefined): Point[] {
  if (preset === 'mathematical') return points;
  const rnd = seededRandom(hashString(seed));
  const amount = preset === 'rough_sketch' ? 0.85 : preset === 'blueprint_neat' ? 0.04 : 0.24;
  if (amount <= 0) return points;

  return points.map((p, idx) => {
    if (idx === 0 || idx === points.length - 1) return p;
    return {
      x: p.x + (rnd() - 0.5) * amount,
      y: p.y + (rnd() - 0.5) * amount,
    };
  });
}

export function withJitterAmount(points: Point[], seed: string, amount: number): Point[] {
  if (amount <= 0) return points;
  const rnd = seededRandom(hashString(seed));
  return points.map((p, idx) => {
    if (idx === 0 || idx === points.length - 1) return p;
    return {
      x: p.x + (rnd() - 0.5) * amount,
      y: p.y + (rnd() - 0.5) * amount,
    };
  });
}
