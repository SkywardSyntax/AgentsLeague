import { describe, it, expect } from 'vitest';
import { compileBatchToStrokes } from '@/lib/whiteboard/semantic-to-strokes';
import { lowerMathPrimitive } from '@/lib/whiteboard/planner/lowerer';
import type { DrawBatch, DrawElement } from '@/types/agent';
import type { ColorTheme } from '@/lib/whiteboard/color-theme';

// ---------------------------------------------------------------------------
// Seeded PRNG for reproducibility (Mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Random element generators
// ---------------------------------------------------------------------------

const THEMES: ColorTheme[] = ['default', 'dark', 'colorful', 'pastel', 'monochrome'];

const EXPRESSIONS = [
  'sin(x)', 'cos(x)', 'x^2', 'x^3', 'sqrt(abs(x))', '1/(1+x^2)',
  'sin(x)*cos(x)', 'x', '2*x+1', 'abs(x)', 'log(abs(x)+1)',
];

function randomBatch(rng: () => number, index: number): DrawBatch {
  const elementCount = 1 + Math.floor(rng() * 8);
  const elements: DrawElement[] = [];
  const theme = THEMES[Math.floor(rng() * THEMES.length)]!;

  for (let i = 0; i < elementCount; i++) {
    const choice = Math.floor(rng() * 10);
    const id = `stress-${index}-${i}`;
    const x = 40 + rng() * 400;
    const y = 40 + rng() * 300;
    const w = 100 + rng() * 300;
    const h = 80 + rng() * 200;

    switch (choice) {
      case 0:
        elements.push({
          id, type: 'cartesian_axes',
          x, y, width: w, height: h,
          xRange: [-(1 + rng() * 9), 1 + rng() * 9],
          yRange: [-(1 + rng() * 5), 1 + rng() * 5],
          gridlines: rng() > 0.5,
        } as DrawElement);
        break;
      case 1:
        elements.push({
          id, type: 'function_curve',
          x, y, width: w, height: h,
          xRange: [-(1 + rng() * 9), 1 + rng() * 9],
          yRange: [-(1 + rng() * 5), 1 + rng() * 5],
          expression: EXPRESSIONS[Math.floor(rng() * EXPRESSIONS.length)],
        } as DrawElement);
        break;
      case 2:
        elements.push({
          id, type: 'vector_arrow',
          x: x + w / 2, y: y + h / 2,
          dx: (rng() - 0.5) * 200, dy: (rng() - 0.5) * 200,
          label: rng() > 0.5 ? 'v' : undefined,
        } as DrawElement);
        break;
      case 3:
        elements.push({
          id, type: 'histogram',
          x, y, width: w, height: h,
          bins: Array.from({ length: 3 + Math.floor(rng() * 8) }, (_, k) => ({
            label: `b${k}`,
            value: 1 + Math.floor(rng() * 100),
          })),
        } as DrawElement);
        break;
      case 4:
        elements.push({
          id, type: 'normal_distribution',
          x, y, width: w, height: h,
          mu: rng() * 10, sigma: 0.5 + rng() * 3,
          showLabels: rng() > 0.5,
        } as DrawElement);
        break;
      case 5:
        elements.push({
          id, type: 'matrix_bracket',
          x, y,
          rows: [
            [String(Math.floor(rng() * 10)), String(Math.floor(rng() * 10))],
            [String(Math.floor(rng() * 10)), String(Math.floor(rng() * 10))],
          ],
          bracketStyle: '[]',
        } as DrawElement);
        break;
      case 6: {
        const angle = rng() * Math.PI * 2;
        elements.push({
          id, type: 'linear_transform',
          x, y, width: w, height: h,
          matrix: [
            [Math.cos(angle), -Math.sin(angle)],
            [Math.sin(angle), Math.cos(angle)],
          ],
          showBasisVectors: true,
        } as DrawElement);
        break;
      }
      case 7:
        elements.push({
          id, type: 'rect', x, y, w, h,
        } as DrawElement);
        break;
      case 8:
        elements.push({
          id, type: 'text', x, y,
          text: `Stress item ${index}-${i}`, size: 14,
        } as DrawElement);
        break;
      case 9:
        elements.push({
          id, type: 'integral_region',
          x, y, width: w, height: h,
          xRange: [0, 1 + rng() * 5] as [number, number],
          yRange: [-(1 + rng() * 3), 1 + rng() * 3] as [number, number],
          expression: 'x^2',
        } as DrawElement);
        break;
    }
  }

  return {
    batch_id: `stress-${index}`,
    colorTheme: theme,
    elements,
  };
}

// ---------------------------------------------------------------------------
// Stress tests
// ---------------------------------------------------------------------------

describe('pipeline stress test (50 random batches)', () => {
  const rng = mulberry32(42);
  const batches = Array.from({ length: 50 }, (_, i) => randomBatch(rng, i));

  it('none of the 50 batches throw during compileBatchToStrokes', async () => {
    const timings: number[] = [];
    for (const batch of batches) {
      const start = performance.now();
      const result = await compileBatchToStrokes(batch);
      const elapsed = performance.now() - start;
      timings.push(elapsed);
      expect(result.strokes).toBeDefined();
      expect(Array.isArray(result.strokes)).toBe(true);
    }
    // Exclude first 3 batches (JIT warmup) when computing median
    const warm = timings.slice(3).sort((a, b) => a - b);
    const median = warm[Math.floor(warm.length / 2)]!;
    // Median should be well under 200ms per batch (generous for CI under load)
    expect(median).toBeLessThan(200);
  }, 60_000);

  it('all 50 batches produce non-empty stroke arrays', async () => {
    for (const batch of batches) {
      const result = await compileBatchToStrokes(batch);
      expect(result.strokes.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('all stroke points have finite coordinates', async () => {
    for (const batch of batches) {
      const result = await compileBatchToStrokes(batch);
      for (const s of result.strokes) {
        for (const p of s.points) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
      }
    }
  }, 60_000);

  it('lowerMathPrimitive does not throw for any primitive element', () => {
    const rng2 = mulberry32(99);
    for (let i = 0; i < 50; i++) {
      const batch = randomBatch(rng2, i + 100);
      for (const el of batch.elements) {
        if (
          el.type === 'function_curve' || el.type === 'cartesian_axes' ||
          el.type === 'vector_arrow' || el.type === 'histogram' ||
          el.type === 'normal_distribution' || el.type === 'matrix_bracket' ||
          el.type === 'linear_transform' || el.type === 'integral_region'
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = lowerMathPrimitive(el as any, batch.colorTheme);
          expect(Array.isArray(result)).toBe(true);
          // Some primitives may return [] legitimately (e.g. zero-length vector)
        }
      }
    }
  });
});
