import type { Point, StylePreset } from '@/types/agent';
import { hashString, seededRandom } from '@/lib/math/seed';

export function withJitter(points: Point[], seed: string, preset: StylePreset | undefined): Point[] {
  const rnd = seededRandom(hashString(seed));
  const amount = preset === 'rough_sketch' ? 0.85 : preset === 'blueprint_neat' ? 0.12 : 0.24;
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
