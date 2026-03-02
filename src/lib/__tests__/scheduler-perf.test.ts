import { describe, it, expect } from 'vitest';
import { createActiveBatch } from '@/lib/whiteboard/stroke-scheduler';
import type { StrokeTrajectory } from '@/types/agent';

describe('createActiveBatch performance', () => {
  it('processes 60 strokes × 200 points within 10ms', () => {
    const strokes: StrokeTrajectory[] = Array.from({ length: 60 }, (_, si) => ({
      id: `s-${si}`,
      elementId: `e-${si}`,
      color: '#000',
      baseWidth: 1.5,
      points: Array.from({ length: 200 }, (_, pi) => ({
        x: pi * 2 + Math.sin(pi * 0.1) * 10,
        y: si * 30 + Math.cos(pi * 0.1) * 10,
      })),
    }));

    const start = performance.now();
    const active = createActiveBatch(strokes, 0);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10);
    expect(active).toHaveLength(60);
    for (const stroke of active) {
      expect(stroke.durationMs).toBeGreaterThanOrEqual(220);
      expect(stroke.durationMs).toBeLessThanOrEqual(2600);
      expect(stroke.length).toBeGreaterThan(0);
      expect(stroke.cumulativeLengths).toHaveLength(200);
    }
  });
});
